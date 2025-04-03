import React, { useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  setDoc,
  doc,
  getDoc
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function App() {
  const [started, setStarted] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pc = useRef(
    new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    })
  );

  const startRoom = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    stream.getTracks().forEach((track) =>
      pc.current.addTrack(track, stream)
    );
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    setStarted(true);

    pc.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    const roomDoc = await addDoc(collection(db, "rooms"), {});
    setRoomId(roomDoc.id);

    pc.current.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(
          collection(db, `rooms/${roomDoc.id}/ice-candidates`),
          event.candidate.toJSON()
        );
      }
    };

    const offer = await pc.current.createOffer();
    await pc.current.setLocalDescription(offer);
    await setDoc(doc(db, "rooms", roomDoc.id), { offer });

    onSnapshot(doc(db, "rooms", roomDoc.id), async (snapshot) => {
      const data = snapshot.data();
      if (
        data?.answer &&
        !pc.current.currentRemoteDescription
      ) {
        await pc.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
      }
    });

    onSnapshot(
      collection(db, `rooms/${roomDoc.id}/ice-candidates`),
      (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            const candidate = new RTCIceCandidate(change.doc.data());
            await pc.current.addIceCandidate(candidate);
          }
        });
      }
    );
  };

  const joinRoom = async () => {
    const inputRoomId = prompt("Enter Room ID:");
    if (!inputRoomId) return;

    const roomRef = doc(db, "rooms", inputRoomId);
    const roomSnap = await getDoc(roomRef);
    const roomData = roomSnap.data();

    if (!roomData?.offer) {
      alert("Room not found or invalid offer.");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    stream.getTracks().forEach((track) =>
      pc.current.addTrack(track, stream)
    );
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    setStarted(true);

    pc.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.current.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(
          collection(db, `rooms/${inputRoomId}/ice-candidates`),
          event.candidate.toJSON()
        );
      }
    };

    await pc.current.setRemoteDescription(
      new RTCSessionDescription(roomData.offer)
    );
    const answer = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answer);
    await setDoc(roomRef, { answer }, { merge: true });

    onSnapshot(
      collection(db, `rooms/${inputRoomId}/ice-candidates`),
      (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            const candidate = new RTCIceCandidate(change.doc.data());
            await pc.current.addIceCandidate(candidate);
          }
        });
      }
    );

    setRoomId(inputRoomId);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-6 gap-6">
      <h1 className="text-3xl font-bold">ATM Video Chat</h1>

      {!started ? (
        <div className="flex gap-4">
          <button
            onClick={startRoom}
            className="bg-green-600 px-4 py-2 rounded"
          >
            Start Room
          </button>
          <button
            onClick={joinRoom}
            className="bg-blue-600 px-4 py-2 rounded"
          >
            Join Room
          </button>
        </div>
      ) : (
        <>
          {roomId && (
            <div className="text-sm bg-gray-800 px-3 py-2 rounded">
              Share this Room ID:
              <span className="font-mono ml-2 text-yellow-400">{roomId}</span>
            </div>
          )}
          <div className="relative w-full max-w-4xl flex justify-center">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full rounded-lg shadow-lg"
            />
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-24 absolute bottom-4 right-4 border-2 border-white rounded shadow-lg"
            />
          </div>
        </>
      )}
    </div>
  );
}
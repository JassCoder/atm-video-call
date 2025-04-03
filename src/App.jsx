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
  const [status, setStatus] = useState("Welcome 👋");
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pc = useRef(new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  }));

  const startRoom = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      stream.getTracks().forEach(track => pc.current.addTrack(track, stream));
      setStarted(true);
      setStatus("🎥 Local stream started");

      pc.current.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setStatus("✅ Remote stream connected!");
        }
      };

      const roomDoc = await addDoc(collection(db, "rooms"), {});
      setRoomId(roomDoc.id);
      setStatus("📡 Room created. Share ID: " + roomDoc.id);

      pc.current.onicecandidate = async (event) => {
        if (event.candidate) {
          await addDoc(collection(db, `rooms/${roomDoc.id}/ice-candidates`), event.candidate.toJSON());
        }
      };

      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      await setDoc(doc(db, "rooms", roomDoc.id), { offer });

      onSnapshot(doc(db, "rooms", roomDoc.id), async (snapshot) => {
        const data = snapshot.data();
        if (data?.answer && !pc.current.currentRemoteDescription) {
          await pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          setStatus("📞 Answer received and remote description set");
        }
      });

      onSnapshot(collection(db, `rooms/${roomDoc.id}/ice-candidates`), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            const candidate = new RTCIceCandidate(change.doc.data());
            await pc.current.addIceCandidate(candidate);
          }
        });
      });
    } catch (err) {
      setStatus("❌ Error starting room: " + err.message);
    }
  };

  const joinRoom = async () => {
    const inputRoomId = prompt("Enter Room ID:");
    if (!inputRoomId) return;

    try {
      const roomRef = doc(db, "rooms", inputRoomId);
      const roomSnap = await getDoc(roomRef);
      const roomData = roomSnap.data();

      if (!roomData?.offer) {
        setStatus("❌ No offer found in this room.");
        return;
      }

      setRoomId(inputRoomId);
      setStatus("🔗 Joining room: " + inputRoomId);

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      stream.getTracks().forEach(track => pc.current.addTrack(track, stream));
      setStarted(true);
      setStatus("🎥 Local stream started");

      pc.current.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setStatus("✅ Remote stream connected!");
        }
      };

      pc.current.onicecandidate = async (event) => {
        if (event.candidate) {
          await addDoc(collection(db, `rooms/${inputRoomId}/ice-candidates`), event.candidate.toJSON());
        }
      };

      await pc.current.setRemoteDescription(new RTCSessionDescription(roomData.offer));
      setStatus("📡 Offer received. Creating answer...");

      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      await setDoc(roomRef, { answer }, { merge: true });

      onSnapshot(collection(db, `rooms/${inputRoomId}/ice-candidates`), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            const candidate = new RTCIceCandidate(change.doc.data());
            await pc.current.addIceCandidate(candidate);
          }
        });
      });
    } catch (err) {
      setStatus("❌ Failed to join room: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">ATM Video Chat</h1>
      <p className="text-yellow-300 text-sm">{status}</p>

      {!started ? (
        <div className="flex gap-4 flex-wrap justify-center">
          <button onClick={startRoom} className="bg-green-600 px-4 py-2 rounded">Start Room</button>
          <button onClick={joinRoom} className="bg-blue-600 px-4 py-2 rounded">Join Room</button>
        </div>
      ) : (
        <>
          {roomId && (
            <div className="text-center bg-red-900 border border-yellow-400 p-4 rounded-xl shadow-lg mt-4 w-full max-w-lg">
              <p className="text-xl font-bold">🚀 ROOM ID (Share this):</p>
              <p className="text-2xl font-mono text-yellow-300 break-words mt-2">{roomId}</p>
            </div>
          )}
          <div className="relative w-full max-w-4xl flex justify-center mt-4">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full rounded-lg shadow-lg" />
            <video ref={localVideoRef} autoPlay playsInline muted className="w-24 absolute bottom-4 right-4 border-2 border-white rounded shadow-lg" />
          </div>
        </>
      )}
    </div>
  );
}
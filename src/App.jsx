import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  setDoc,
  doc,
  deleteDoc
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function App() {
  const [started, setStarted] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pc = useRef(new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }));
  const roomRef = useRef(null);

  const handleStart = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(track => pc.current.addTrack(track, stream));
      localVideoRef.current.srcObject = stream;
      setStarted(true);

      pc.current.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      pc.current.onicecandidate = async (event) => {
        if (event.candidate && roomRef.current) {
          await addDoc(collection(db, `rooms/${roomRef.current.id}/ice-candidates`), event.candidate.toJSON());
        }
      };

      const roomsCol = collection(db, "rooms");
      const roomDoc = await addDoc(roomsCol, { created: Date.now() });
      roomRef.current = roomDoc;

      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      await setDoc(doc(db, "rooms", roomDoc.id), { offer });

      const unsub = onSnapshot(doc(db, "rooms", roomDoc.id), async (snapshot) => {
        const data = snapshot.data();
        if (data?.answer && !pc.current.currentRemoteDescription) {
          await pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
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

      alert("Waiting for peer to join... Share this room ID: " + roomDoc.id);
    } catch (err) {
      console.error("Error starting video chat:", err);
      alert("Error: " + err.message);
    }
  };

  const handleJoin = async () => {
    const roomId = prompt("Enter Room ID to join:");
    if (!roomId) return;
    const roomSnapshot = await doc(db, "rooms", roomId);
    const roomData = (await roomSnapshot.get()).data();
    if (!roomData?.offer) {
      alert("Room not found or offer missing.");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.getTracks().forEach(track => pc.current.addTrack(track, stream));
    localVideoRef.current.srcObject = stream;

    pc.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.current.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(collection(db, `rooms/${roomId}/ice-candidates`), event.candidate.toJSON());
      }
    };

    await pc.current.setRemoteDescription(new RTCSessionDescription(roomData.offer));
    const answer = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answer);
    await setDoc(doc(db, "rooms", roomId), { answer }, { merge: true });

    onSnapshot(collection(db, `rooms/${roomId}/ice-candidates`), (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          await pc.current.addIceCandidate(candidate);
        }
      });
    });

    setStarted(true);
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center gap-4">
      <h1 className="text-3xl font-bold">ATM Video Chat</h1>
      {!started && (
        <div className="flex gap-4">
          <button onClick={handleStart} className="bg-green-600 px-4 py-2 rounded">Start Room</button>
          <button onClick={handleJoin} className="bg-blue-600 px-4 py-2 rounded">Join Room</button>
        </div>
      )}
      <div className="w-full max-w-3xl flex justify-center relative">
        <video ref={remoteVideoRef} autoPlay playsInline className="w-full rounded-lg shadow-lg" />
        <video ref={localVideoRef} autoPlay playsInline muted className="w-24 absolute bottom-4 right-4 border-2 border-white rounded shadow-lg" />
      </div>
    </div>
  );
}
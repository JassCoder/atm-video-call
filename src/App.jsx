import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
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

const pc = { current: new RTCPeerConnection() };

export default function App() {
  const [localStream, setLocalStream] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [filters, setFilters] = useState({ language: "", tag: "" });
  const [gender, setGender] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [started, setStarted] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const handleStart = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stream.getTracks().forEach((track) =>
        pc.current.addTrack(track, stream)
      );
      localVideoRef.current.srcObject = stream;
      setLocalStream(stream);
      setStarted(true);
    } catch (err) {
      console.error("Failed to access camera/mic:", err);
      alert("Camera/Mic access failed. Please allow permissions and try again.");
    }
  };

  return (
    !started ? (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white text-center">
        <h1 className="text-4xl mb-6 font-bold">Welcome to ATM</h1>
        <button onClick={handleStart} className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg text-lg transition-all duration-300">
          Start Chat
        </button>
      </div>
    ) : (
      <div className="relative flex flex-col items-center justify-center min-h-screen gap-6 p-6 bg-gray-900 text-white">
        <div className="w-full bg-gray-800 text-center text-xs text-white p-1 rounded mb-2">
          [Top Banner Ad Placeholder]
        </div>

        <h1 className="text-3xl font-bold">ATM</h1>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative w-full max-w-3xl">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full rounded-xl shadow-lg" />
          <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-2 right-2 w-24 md:w-40 rounded-lg border-2 border-white shadow-lg" />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="flex flex-col md:flex-row items-start justify-between mt-4 w-full max-w-5xl gap-6">
          <div className="w-full md:w-1/2">
            <h2 className="text-lg mb-2">Text Chat</h2>
            <div className="bg-gray-800 w-full h-40 overflow-y-auto p-2 rounded">
              {messages.map((msg, i) => <p key={i} className="text-sm">{msg.text}</p>)}
            </div>
            <div className="flex mt-2 w-full">
              <input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type message..." className="flex-1 px-2 py-1 text-black rounded-l" />
              <button onClick={() => {}} className="px-3 py-1 bg-green-600 rounded-r hover:bg-green-700 transition-all duration-300">Send</button>
            </div>
          </div>

          <div className="mt-6 w-full md:w-1/2">
            <h2 className="text-lg mb-2">Filters</h2>
            <input placeholder="Language (e.g. English)" value={filters.language} onChange={e => setFilters({ ...filters, language: e.target.value })} className="mb-2 px-2 py-1 text-black rounded w-full" />
            <input placeholder="Tag (e.g. Gaming)" value={filters.tag} onChange={e => setFilters({ ...filters, tag: e.target.value })} className="px-2 py-1 text-black rounded w-full focus:outline-none focus:ring-2 ring-blue-400 transition-all duration-300" />

            <h2 className="text-lg mt-4 mb-2">Gender</h2>
            <select value={gender} onChange={e => setGender(e.target.value)} className="px-2 py-1 text-black rounded w-full focus:outline-none focus:ring-2 ring-blue-400 transition-all duration-300">
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </motion.div>

        <AnimatePresence>
          {waiting && (
            <motion.p
              className="mt-4 text-yellow-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              Waiting for a stranger to connect...
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex gap-4 mt-4">
          <button onClick={() => {}} className="px-4 py-2 bg-red-600 rounded hover:bg-red-700 transition-all duration-300">Skip</button>
          <button onClick={() => {}} className="px-4 py-2 bg-yellow-500 rounded hover:bg-yellow-600 transition-all duration-300">Report</button>
        </div>
      </div>
    )
  );
}
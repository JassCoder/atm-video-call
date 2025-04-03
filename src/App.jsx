
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
  setDoc,
  getDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function App() {
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const pc = useRef(new RTCPeerConnection(servers));

  const [roomId, setRoomId] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [filters, setFilters] = useState({ language: "", tag: "" });
  const [gender, setGender] = useState("");
  const [hideMobileAd, setHideMobileAd] = useState(false);
  const [blockedRooms, setBlockedRooms] = useState([]);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const setupMedia = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stream.getTracks().forEach((track) => pc.current.addTrack(track, stream));
      localVideoRef.current.srcObject = stream;
      setLocalStream(stream);
    };

    setupMedia();
  }, []);

  useEffect(() => {
    if (localStream) match();
  }, [localStream]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !roomId) return;
    const roomRef = doc(db, "rooms", roomId);
    await addDoc(collection(roomRef, "messages"), {
      text: newMessage,
      created: Date.now(),
    });
    setNewMessage("");
  };

  const setupMessages = (roomRef) => {
    const unsub = onSnapshot(collection(roomRef, "messages"), (snapshot) => {
      const msgs = snapshot.docs.map((doc) => doc.data());
      setMessages(msgs.sort((a, b) => a.created - b.created));
    });
  };

  const match = async () => {
    const roomCol = collection(db, "rooms");
    setWaiting(true);

    const opposite = gender === "male" ? "female" : gender === "female" ? "male" : "other";
    let matched = false;

    const unsubscribe = onSnapshot(roomCol, async (snapshot) => {
      if (matched) return;

      for (const docChange of snapshot.docChanges()) {
        const roomDoc = docChange.doc;
        const roomData = roomDoc.data();
        if (
          !roomData.offer &&
          roomDoc.id !== roomId &&
          roomData.filters?.gender === opposite &&
          !blockedRooms.includes(roomDoc.id)
        ) {
          matched = true;
          await joinRoom(roomDoc.id);
          unsubscribe();
          return;
        }
      }

      setTimeout(async () => {
        if (matched) return;
        for (const docChange of snapshot.docChanges()) {
          const roomDoc = docChange.doc;
          const roomData = roomDoc.data();
          if (!roomData.offer && roomDoc.id !== roomId && !blockedRooms.includes(roomDoc.id)) {
            matched = true;
            await joinRoom(roomDoc.id);
            unsubscribe();
            return;
          }
        }

        if (!matched) {
          const roomRef = await addDoc(roomCol, {});
          setRoomId(roomRef.id);
          await createOffer(roomRef.id);
          matched = true;
          unsubscribe();
        }
      }, 3000);
    });
  };

  const createOffer = async (roomId) => {
    const roomRef = doc(db, "rooms", roomId);

    pc.current.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(collection(roomRef, "callerCandidates"), event.candidate.toJSON());
      }
    };

    pc.current.ontrack = (event) => {
      remoteVideoRef.current.srcObject = event.streams[0];
    };

    const offer = await pc.current.createOffer();
    await pc.current.setLocalDescription(offer);
    await setDoc(roomRef, { offer, filters: { ...filters, gender } });
    setupMessages(roomRef);

    onSnapshot(roomRef, async (snapshot) => {
      const data = snapshot.data();
      if (!pc.current.currentRemoteDescription && data?.answer) {
        const answer = new RTCSessionDescription(data.answer);
        await pc.current.setRemoteDescription(answer);
      }
    });

    onSnapshot(collection(roomRef, "calleeCandidates"), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.current.addIceCandidate(candidate);
        }
      });
    });
  };

  const joinRoom = async (roomId) => {
    setRoomId(roomId);
    const roomRef = doc(db, "rooms", roomId);
    const roomSnapshot = await getDoc(roomRef);
    const roomData = roomSnapshot.data();

    pc.current.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(collection(roomRef, "calleeCandidates"), event.candidate.toJSON());
      }
    };

    pc.current.ontrack = (event) => {
      remoteVideoRef.current.srcObject = event.streams[0];
    };

    await pc.current.setRemoteDescription(new RTCSessionDescription(roomData.offer));
    const answer = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answer);
    await setDoc(roomRef, { ...roomData, answer, filters: { ...filters, gender } });
    setupMessages(roomRef);

    onSnapshot(collection(roomRef, "callerCandidates"), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.current.addIceCandidate(candidate);
        }
      });
    });
  };

  const cleanUp = async () => {
    if (roomId) {
      try {
        await deleteDoc(doc(db, "rooms", roomId));
      } catch (e) {
        console.error("Failed to delete room", e);
      }
    }
    pc.current.close();
    pc.current = new RTCPeerConnection(servers);
    localStream.getTracks().forEach((track) => pc.current.addTrack(track, localStream));
    setRoomId(null);
    setWaiting(false);
  };

  const skip = async () => {
    await cleanUp();
  };

  const reportRoom = async () => {
    if (!roomId) return;
    try {
      await addDoc(collection(db, "reports"), {
        roomId,
        reportedAt: Date.now(),
        gender,
      });
      setBlockedRooms((prev) => [...prev, roomId]);
      alert("User has been reported. You will be reconnected.");
      skip();
    } catch (e) {
      console.error("Report failed", e);
    }
  };

  if (showSplash) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex items-center justify-center h-screen bg-black text-white flex-col"
      >
        <img
          src="/loading-heart.png"
          alt="Loading Heart"
          className="w-24 h-24 object-contain mb-4"
        />
        <motion.h1
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1 }}
          className="text-sm font-medium text-gray-400"
        >
          Connecting you anonymously…
        </motion.h1>
      </motion.div>
    );
  }

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen gap-6 p-6 bg-gray-900 text-white">
      <div className="w-full bg-gray-800 text-center text-xs text-white p-1 rounded mb-2">
        [Top Banner Ad Placeholder]
      </div>
      <h1 className="text-3xl font-bold">ATM</h1>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative w-full max-w-3xl"
      >
        <video ref={remoteVideoRef} autoPlay playsInline className="w-full rounded-xl shadow-lg" />
        <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-2 right-2 w-24 md:w-40 rounded-lg border-2 border-white shadow-lg" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="flex flex-col md:flex-row items-start justify-between mt-4 w-full max-w-5xl gap-6"
      >
        <div className="w-full md:w-1/2">
          <h2 className="text-lg mb-2">Text Chat</h2>
          <div className="bg-gray-800 h-40 overflow-y-auto p-2 rounded">
            {messages.map((msg, i) => (
              <p key={i} className="text-sm">{msg.text}</p>
            ))}
          </div>
          <div className="flex mt-2 w-full">
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type message..."
              className="flex-1 px-2 py-1 text-black rounded-l"
            />
            <button onClick={sendMessage} className="px-3 py-1 bg-green-600 rounded-r hover:bg-green-700 transition-all duration-300">
              Send
            </button>
          </div>
        </div>

        <div className="mt-6 w-full md:w-1/2">
          <h2 className="text-lg mb-2">Filters</h2>
          <input
            placeholder="Language (e.g. English)"
            value={filters.language}
            onChange={(e) => setFilters({ ...filters, language: e.target.value })}
            className="mb-2 px-2 py-1 text-black rounded w-full"
          />
          <input
            placeholder="Tag (e.g. Gaming)"
            value={filters.tag}
            onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
            className="px-2 py-1 text-black rounded w-full focus:outline-none focus:ring-2 ring-blue-400 transition-all duration-300"
          />
        </div>

        <div className="mt-6 w-full md:w-1/2">
          <h2 className="text-lg mb-2">Gender</h2>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="px-2 py-1 text-black rounded w-full focus:outline-none focus:ring-2 ring-blue-400 transition-all duration-300"
          >
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
        <button
          onClick={skip}
          className="px-4 py-2 bg-red-600 rounded hover:bg-red-700 transition-all duration-300"
        >
          Skip
        </button>
        <button
          onClick={reportRoom}
          className="px-4 py-2 bg-yellow-500 rounded hover:bg-yellow-600 transition-all duration-300"
        >
          Report
        </button>
      </div>

      {!hideMobileAd && (
        <div className="md:hidden fixed bottom-0 w-full bg-gray-800 text-white text-center p-2 text-sm shadow-lg flex justify-between items-center px-4">
          <span>[Mobile Bottom Ad]</span>
          <button onClick={() => setHideMobileAd(true)} className="text-red-400 text-xs ml-4">✕</button>
        </div>
      )}
    </div>
  );
}

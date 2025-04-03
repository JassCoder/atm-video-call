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

// ... same full working code as above ...
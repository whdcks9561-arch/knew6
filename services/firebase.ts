// firebase.ts
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  orderBy,
  query,
  limit
} from "firebase/firestore";

import { CharacterType } from "../types"; // ★ 타입 충돌 해결

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  character: CharacterType;
  timestamp: number;
}

// ------------------------------------------------------
// firebase.json 불러오기
// ------------------------------------------------------
let firebaseConfigCache: any = null;

async function loadFirebaseConfig() {
  if (firebaseConfigCache) return firebaseConfigCache;

  const res = await fetch("/firebase.json");
  if (!res.ok) throw new Error("firebase.json 파일을 불러올 수 없습니다.");

  firebaseConfigCache = await res.json();
  return firebaseConfigCache;
}

// ------------------------------------------------------
// Firestore 초기화
// ------------------------------------------------------
let db: any = null;

async function initFirebase() {
  if (db) return db;

  const config = await loadFirebaseConfig();
  const app = initializeApp(config);
  db = getFirestore(app);

  return db;
}

// ------------------------------------------------------
// 🔥 온라인 상태 체크 — App.tsx와 타입 오류 해결
// ------------------------------------------------------
export async function checkOnlineStatus() {
  try {
    const res = await fetch("https://firestore.googleapis.com", { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

// ------------------------------------------------------
// 🔥 글로벌 랭킹 저장 — App.tsx newEntry와 완벽 호환
// ------------------------------------------------------
export async function saveScoreToFirestore(
  entry: { name: string; score: number; character: CharacterType }
) {
  const firestore = await initFirebase();

  await addDoc(collection(firestore, "globalLeaderboard"), {
    name: entry.name,
    score: entry.score,
    character: entry.character,
    timestamp: serverTimestamp()
  });

  return true;
}

// ------------------------------------------------------
// 🔥 글로벌 랭킹 조회 (TOP 20) — 인자 mismatch 해결
// ------------------------------------------------------
export async function getLeaderboardFromFirestore(limitCount: number = 20): Promise<LeaderboardEntry[]> {
  const firestore = await initFirebase();

  const q = query(
    collection(firestore, "globalLeaderboard"),
    orderBy("score", "desc"),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();

    return {
      id: doc.id,
      name: data.name ?? "",
      score: data.score ?? 0,
      character: data.character as CharacterType, // ★ enum 타입 변환 처리
      timestamp: data.timestamp?.seconds ?? 0
    };
  });
}

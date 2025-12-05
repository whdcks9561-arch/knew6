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

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  character: string;
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
// 🔥 글로벌 랭킹 저장 — App.tsx와 완벽 호환 버전
// ------------------------------------------------------
export async function saveScoreToFirestore(
  entry: { name: string; score: number; character: string }
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
// 🔥 글로벌 랭킹 조회 (TOP 20)
// ------------------------------------------------------
export async function getLeaderboardFromFirestore(): Promise<LeaderboardEntry[]> {
  const firestore = await initFirebase();

  const q = query(
    collection(firestore, "globalLeaderboard"),
    orderBy("score", "desc"),
    limit(20)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name ?? "",
      score: data.score ?? 0,
      character: data.character ?? "",
      timestamp: data.timestamp?.seconds ?? 0
    };
  });
}

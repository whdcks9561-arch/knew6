import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const generateGameOverMessage = async (score: number): Promise<string> => {
  const client = getClient();
  if (!client) {
    return "Great effort! Try again!";
  }

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `The player just scored ${score} points in a platform jumping game playing as a cute puzzle piece character. 
      Write a short, encouraging, and slightly witty sentence (max 15 words) for the Game Over screen. 
      Don't use quotes.`,
    });
    return response.text.trim();
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Oops! You fell! Try again.";
  }
};

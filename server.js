// 必要なライブラリを読み込む
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Expressアプリを初期化
const app = express();
app.use(express.json()); // JSON形式のリクエストを扱えるようにする

// GitHub SecretsからAPIキーを読み込む
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('エラー: GEMINI_API_KEY が設定されていません。');
  process.exit(1); // エラーでプログラムを終了
}

// Google AIクライアントを初期化
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // 最新の高速モデルを使用

// フロントエンド（index.html）を提供するための設定
app.use(express.static('.'));

// '/ask' というURLで質問を受け付ける口（APIエンドポイント）を作る
app.post('/ask', async (req, res) => {
  try {
    const userQuestion = req.body.question;
    if (!userQuestion) {
      return res.status(400).json({ error: '質問がありません。' });
    }

    // Geminiに質問を投げる
    const result = await model.generateContent(userQuestion);
    const response = await result.response;
    const answer = response.text();

    // 答えをフロントエンドに返す
    res.json({ answer: answer });

  } catch (error) {
    console.error('AIからの応答取得中にエラーが発生しました:', error);
    res.status(500).json({ error: 'AIとの通信中にエラーが発生しました。' });
  }
});

// サーバーを起動するポート番号を指定
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました。 http://localhost:${PORT}`);
});

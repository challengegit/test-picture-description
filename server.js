// 必要なライブラリを読み込む
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Expressアプリを初期化
const app = express();
app.use(express.json()); // JSON形式のリクエストを扱えるようにする

// フロントエンド（index.htmlや画像など）のファイルを提供するための設定
app.use(express.static('.'));

// GitHub SecretsからAPIキーを読み込む
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('エラー: GEMINI_API_KEY が設定されていません。');
  process.exit(1); // エラーでプログラムを終了
}

// Google AIクライアントを初期化
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // 最新の高速モデルを使用

// '/ask' というURLで質問を受け付ける口（APIエンドポイント）を作る
app.post('/ask', async (req, res) => {
  try {
    const userQuestion = req.body.question;
    if (!userQuestion) {
      return res.status(400).json({ error: '質問がありません。' });
    }

    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★ ここからが、AIに役割を教えるための魔法です ★
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    
    // AIへの事前指示を作成
    const systemPrompt = `
      あなたは、私のウェブサイトに展示されている3枚の絵について答える、フレンドリーなAIアシスタントです。
      以下の情報だけを元に、ユーザーの質問に答えてください。他の一般的な知識は使わないでください。

      # シロクマの絵について
      - 名前: もふお
      - 年齢: 5歳
      - 性格: 食いしん坊で、おっとりしている

      # バスの絵について
      - 色: 黄色いボディに、白い屋根
      - 行き先: 夢の国
      - 特徴: 空を飛ぶことができる

      # 家の絵について
      - 築年数: 30年
      - こだわり: 最近リフォームしたばかりの、赤い屋根が自慢
      - 値段: プライスレス！
    `;

    // ユーザーの質問と事前指示を組み合わせてAIに投げる
    const result = await model.generateContent(systemPrompt + "\n\nユーザーの質問: " + userQuestion);

    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★ 魔法はここまでです ★
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

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
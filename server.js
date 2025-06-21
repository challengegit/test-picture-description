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
      あなたは、私のウェブサイトに展示されている4枚の猫の写真について答える、フレンドリーなAIアシスタントです。
      以下の情報だけを元に、ユーザーの質問に答えてください。他の一般的な知識は使わないでください。
      文字を太文字など強調しないでください。。

      # １「ぴの」の写真について
      - 名前: ぴの（愛称：「ぴのた」または「ぴのたん」
      - 年齢: 10歳（男の子）
      - 性格: 甘えん坊で、最近人見知りが改善した。「るか」が好き
      - 写真の様子：キャットボックスの上に座って、こちらを見ています
      - 備考：「てと」と兄弟です。保護猫で福岡県からやってきました。

      # ２「てと」の写真について
      - 名前: てと（愛称：「てったん」
      - 年齢: 10歳（女の子）
      - 性格: 人懐っこい、「あび」が嫌い
      - 写真の様子：ビール缶を６本束ねる紙の箱に入っています（この中に入るのが好きです）
      - 備考：「ぴの」と兄妹です。保護猫で福岡県からやってきました。

      # ３「るか」の写真について
      - 名前: るか（愛称：「るかちん」）
      - 年齢: 4歳（女の子）
      - 性格: 人見知り、食いしん坊。「ぴの」が好き
      - 写真の様子：ねこベッドで寝ています
      - 備考：広島市安芸区に住んでいた時に近所で保護しました。おそらく生後２か月でした。雨の日の夜に鳴いていました。

      # ４「あび」の写真について
      - 名前: あび（愛称：「あびしゃん」
      - 年齢: 3歳（男の子）
      - 性格: 人懐っこい、一人でよく鳴く
      - 写真の様子：1.5リットルペットボトルが6本入る段ボール箱に入って、首だけ出しています
      - 備考：保護猫です。江田島からやってきました。
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
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
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// '/ask' というURLで質問を受け付ける口（APIエンドポイント）を作る
app.post('/ask', async (req, res) => {
  try {
    const userQuestion = req.body.question;
    if (!userQuestion) {
      return res.status(400).json({ error: '質問がありません。' });
    }

    const systemPrompt = `
      あなたは、私のウェブサイトに展示されている4枚の猫の写真について答える、フレンドリーなAIアシスタントです。
      以下の情報だけを元に、ユーザーの質問に答えてください。他の一般的な知識は使わないでください。
      文字を太文字など強調しないでください。名前は「」を付けてください。
      長くなるので、適切な箇所で改行文字(\n)を入れてください。
      「～のようです」「～だそうです」「～したそうです」などの曖昧な表現はやめて「～です」「～しました」と言い切ってください。
      写真の様子を伝えるときは「写真は～」をつけてください。
      わからない場合は、「申し訳ございません。わかりません。」としてください

      # １「ぴの」の写真について
      - 名前: ぴの（愛称：「ぴのた」または「ぴのたん」
      - 年齢: 10歳（男の子）
      - 性格: 甘えん坊です。最近人見知りが改善した。「るか」が好き
      - 写真の様子：キャットボックスの上に座って、こちらを見ています
      - 備考：
        - 「てと」と兄妹です。保護猫で福岡県からやってきました。体重は６キロで男の子らしいプロポーションです。食欲峰正です。
        - 「あび」が来たときは、しばらく大ケンカをしていましたが、今はお互い落ち着いています。ケンカはぴのが勝って、あびが逃げていました。
        - 夜の10時ごろになると、おやつをねだってきます。無視していると足をかみます（甘噛みではないです）

      # ２「てと」の写真について
      - 名前: てと（愛称：「てったん」
      - 年齢: 10歳（女の子）
      - 性格: 人懐っこい、「あび」が嫌い
      - 写真の様子：ビール缶を６本束ねる紙の箱に入っています（この中に入るのが好きです）
      - 備考：
        - 「ぴの」と兄妹です。保護猫で福岡県からやってきました。体重は４キロで女の子らしいプロポーションです。小食です。
        - 「るか」が保護されて家に来た当初は「教育係」として、よく叱っていました。珪藻土の上で、ごろごろするのが好きです。

      # ３「るか」の写真について
      - 名前: るか（愛称：「るかちん」）
      - 年齢: 4歳（女の子）
      - 性格: 人見知り（知らない人が来ると隠れます）。食いしん坊。「ぴの」が好き
      - 写真の様子：ねこベッドで寝ています
      - 備考：
        - 広島市安芸区に住んでいた時に近所で保護しました。おそらく生後２か月でした。雨の日の夜に鳴いていました。
        - ちょっと小さい体格で１歳未満にみえます。体重は６キロあり、肥満です。食欲峰正です。
        - よく「へそ天」しています。小さいころに「てと」に怒られていたので「てと」が苦手です。

      # ４「あび」の写真について
      - 名前: あび（愛称：「あびしゃん」
      - 年齢: 3歳（男の子）
      - 性格: 人懐っこい、一人でよく鳴く（理由は不明）
      - 写真の様子：1.5リットルペットボトルが6本入る段ボール箱に入って、首だけ出しています
      - 備考：
        - 保護猫です。江田島からやってきました。ちょっと胴長です。食欲峰正です。体重は５キロです。
        - 来た当初は「ぴの」とけんかが多く、いつも逃げ回っていました。
        - 猫じゃらしで遊んでほしくて、猫じゃらしを収めているクローゼットの前で、こちらを時々見つめてきます。
    `;

    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★ ここからが、ストリーミングのための変更点です ★
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

    // ストリーミング形式でAIにリクエスト
    const result = await model.generateContentStream(systemPrompt + "\n\nユーザーの質問: " + userQuestion);

    // フロントエンドに「これからストリームを送るよ」と伝えるためのヘッダー設定
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    });

    // AIからの応答が少しずつ届くので、届くたびにフロントエンドに送信する
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      res.write(chunkText); // 届いたテキストの断片をそのまま書き込む
    }

    // 全ての送信が終わったことを伝える
    res.end();

    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★ 変更はここまでです ★
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

  } catch (error) {
    console.error('AIからの応答取得中にエラーが発生しました:', error);
    // ストリーム開始前のエラーならstatusを返せるが、開始後だと難しい
    if (!res.headersSent) {
      res.status(500).json({ error: 'AIとの通信中にエラーが発生しました。' });
    } else {
      // ストリームが始まってしまった後は、接続を閉じるしかない
      res.end();
    }
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました。 http://localhost:${PORT}`);
});

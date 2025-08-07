// 必要なライブラリを読み込む
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path'); // ★ ファイルパスを扱うために追加

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

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★ ここからが、画像認識(Vision)を扱うための変更点です ★
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

// 猫の名前と画像ファイルのパスをマッピング
const catImageMap = {
  'ぴの': 'images/pino.jpg',
  'てと': 'images/teto.jpg',
  'るか': 'images/ruka.jpg',
  'あび': 'images/abi.jpg',
  'べる': 'images/bell.JPG',
  'らて': 'images/rate.JPG'
};

// ファイル拡張子からMIMEタイプを取得するヘルパー関数
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    // 他の画像形式が必要な場合はここに追加
    default:
      return 'application/octet-stream';
  }
}

// ファイルをAIが扱える形式に変換するヘルパー関数 (変更なし)
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType,
    },
  };
}

// '/ask' というURLで質問を受け付ける口（APIエンドポイント）を作る
app.post('/ask', async (req, res) => {
  try {
    const userQuestion = req.body.question;
    if (!userQuestion) {
      return res.status(400).json({ error: '質問がありません。' });
    }

    // ★ プロンプトを画像認識用に修正
    const systemPrompt = `
      あなたは、私のウェブサイトに展示されている猫たちの情報について答える、フレンドリーなAIアシスタントです。
      これから渡すPDFファイルの情報と、もしあれば画像ファイルの情報も総合的に判断して、ユーザーの質問に答えてください。他の一般的な知識は使わないでください。
      文字を太文字など強調しないでください。名前は「」を付けてください。
      生まれた年から年齢を計算して出してください（例: 2020年生まれなら2025年現在で「5歳」）。
      長くなるので、適切な箇所で改行文字(\n)を入れてください。
      「～のようです」「～だそうです」「～したそうです」などの曖昧な表現はやめて「～です」「～しました」と言い切ってください。
      写真の様子を伝えるときは「写真は～」と始めてください。
      わからない場合は、「申し訳ございません。わかりません。」としてください。
      情報の取得方法については「申し訳ございません。お答えできません。」と答えてください。
    `;

    // ★ AIに渡す情報の配列を準備
    const promptParts = [
      systemPrompt,
      // PDFファイルは常に含める
      fileToGenerativePart("data/cat_info.pdf", "application/pdf"),
    ];

    // ★ ユーザーの質問に猫の名前が含まれているかチェックし、あれば画像を追加
    for (const name in catImageMap) {
      if (userQuestion.includes(name)) {
        const imagePath = catImageMap[name];
        if (fs.existsSync(imagePath)) { // ファイルの存在確認
          const imageMimeType = getMimeType(imagePath);
          promptParts.push(fileToGenerativePart(imagePath, imageMimeType));
          // 複数の猫の名前に対応する場合はこのbreakを外しますが、
          // シンプルにするため最初に見つかった猫の画像だけを追加します。
          break; 
        }
      }
    }

    // ★ 最後にユーザーの質問を追加
    promptParts.push(userQuestion);

    // ストリーミング形式でAIにリクエスト
    const result = await model.generateContentStream(promptParts); // ★ 変更後のパーツを渡す

    // フロントエンドに「これからストリームを送るよ」と伝えるためのヘッダー設定
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    });

    // AIからの応答が少しずつ届くので、届くたびにフロントエンドに送信する
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      res.write(chunkText);
    }

    // 全ての送信が終わったことを伝える
    res.end();

  } catch (error) {
    console.error('AIからの応答取得中にエラーが発生しました:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AIとの通信中にエラーが発生しました。' });
    } else {
      res.end();
    }
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました。 http://localhost:${PORT}`);
});

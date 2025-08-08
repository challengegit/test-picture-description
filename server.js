// 必要なライブラリを読み込む
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Expressアプリを初期化
const app = express();
app.use(express.json()); // JSON形式のリクエストを扱えるようにする

// フロントエンド（画像やCSSなど）のファイルを提供するための設定
app.use(express.static(path.join(__dirname, '.')));

// トップページにアクセスがあったら、index.htmlを返すように命令します
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// GitHub SecretsからAPIキーを読み込む
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('エラー: GEMINI_API_KEY が設定されていません。');
  process.exit(1);
}

// Google AIクライアントの初期化
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 猫の名前と画像ファイルのパスをマッピング（絶対パスで解決するように）
const catImageMap = {
  'ぴの': path.join(__dirname, 'images/pino.jpg'),
  'てと': path.join(__dirname, 'images/teto.jpg'),
  'るか': path.join(__dirname, 'images/ruka.jpg'),
  'あび': path.join(__dirname, 'images/abi.jpg'),
  'べる': path.join(__dirname, 'images/bell.JPG'),
  'らて': path.join(__dirname, 'images/rate.JPG')
};
// PDFファイルのパスも絶対パスで定義
const pdfPath = path.join(__dirname, 'data/cat_info.pdf');

// ファイル拡張子からMIMEタイプを取得するヘルパー関数
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    default: return 'application/octet-stream';
  }
}

// ファイルをAIが扱える形式に変換するヘルパー関数
function fileToGenerativePart(filePath, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
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
    
    let targetCatName = null;
    let targetImagePart = null;

    for (const name in catImageMap) {
      if (userQuestion.includes(name)) {
        targetCatName = name;
        const imagePath = catImageMap[name];
        if (fs.existsSync(imagePath)) {
          const imageMimeType = getMimeType(imagePath);
          targetImagePart = fileToGenerativePart(imagePath, imageMimeType);
        }
        break;
      }
    }
    
    const systemInstruction = `
      あなたはユーザーの質問に対し、必ずJSON形式で回答を生成するAIです。
      あなたの出力は、説明文などを一切含まず、JSONオブジェクトそのものでなければなりません。

      ## JSONフォーマット
      {
        "displayText": "表示用のテキスト",
        "speechText": "音声読み上げ用のひらがなテキスト"
      }

      ## displayTextのルール
      - ${targetCatName ? `「${targetCatName}」になりきり、一人称（ぼく、私など）でフレンドリーな猫の口調で記述する。` : '第三者視点で、全ての猫について紹介する。'}
      - 「～です」「～ます」といった断定表現のみを使用する。「～のようです」「～だそうです」は禁止。
      - 適切な箇所で改行文字(\\n)を入れる。
      - 猫の名前は「」で囲む。
      - 生まれた年から現在の年齢を計算して含める。
      - 写真について言及する場合は「写真は～」から始める。

      ## speechTextのルール
      - displayTextと全く同じ内容を、すべてひらがなにする。
      - 漢字、カタカナ、アルファベット、数字は使用禁止。
      - 句読点（、。）と「」のみ使用を許可する。
      - 「愛称」の読みは「あいしょう」とする。
      
      ## その他のルール
      - 提供されたPDFと画像の情報を元に回答する。一般的な知識は使わない。
      - 不明な点は、両方のテキストに「申し訳ございません。わかりません。」と入れる。
      
      以上のルールを絶対に守り、JSONオブジェクトのみを出力してください。
    `;

    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★ ここが全ての解決策です。APIの公式仕様に完全に準拠します。 ★
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

    // 1. モデルの初期化時に、システムへの指示を公式の方法で設定する
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemInstruction,
    });

    // 2. ユーザーからの入力（ファイルや質問）だけをまとめた配列を作成する
    const userParts = [
      fileToGenerativePart(pdfPath, "application/pdf"),
    ];
    if (targetImagePart) {
      userParts.push(targetImagePart);
    }
    userParts.push({ text: userQuestion }); // ユーザーの質問も正しくオブジェクトにする

    // 3. 応答を生成する際に、正しいキー名でJSONモードを指定する
    const result = await model.generateContent({
        contents: [{ role: "user", parts: userParts }],
        generationConfig: {
            // 4. 正しいキー名は "responseMimeType" (camelCase) です
            responseMimeType: "application/json",
        },
    });

    const responseText = result.response.text();
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(responseText);

  } catch (error) {
    console.error('[/ask] 処理中にエラーが発生しました:', error);
    res.status(500).json({ error: 'AIとの通信中にエラーが発生しました。詳細はサーバーログを確認してください。' });
  }
});

app.get('/favicon.ico', (req, res) => res.status(204).send());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました。`);
});

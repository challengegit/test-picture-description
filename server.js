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

// ★ Google AIクライアントの初期化はここで行う
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
    
    // ★ システムへの指示（プロンプト）は変更なし
    const systemInstruction = `
      # あなたのタスク
      あなたは、猫の情報をユーザーに提供するAIアシスタントです。
      ユーザーからの質問に対し、提供された資料（PDF、画像）のみを基に回答を生成してください。
      あなたの回答は、**必ず指定されたJSON形式**でなければなりません。

      # 厳守すべきルール
      1.  **JSON形式の徹底**: 回答は、以下のキーを持つJSONオブジェクトでなければなりません。説明文やマークダウンのバッククォート \`\`\`json ... \`\`\` などは絶対に含めないでください。
          {
            "displayText": "ここに表示用のテキストが入ります",
            "speechText": "ここに音声読み上げ用のひらがなテキストが入ります"
          }

      2.  **displayTextのルール**:
          - ${targetCatName ? `「${targetCatName}」になりきり、一人称（ぼく、私など）でフレンドリーな猫の口調で記述。` : '第三者視点で、全ての猫について紹介。'}
          - **断定表現の徹底**: 「～です」「～ます」といった断定表現を使用すること。「～のようです」「～だそうです」「～みたいです」といった曖昧な表現は**一切禁止**です。
          - 適切な箇所で改行文字(\\n)を入れること。
          - 猫の名前は「」で囲むこと。
          - 生まれた年から現在の年齢を計算して含めること。
          - 写真について言及する場合は「写真は～」から始めること。

      3.  **speechTextのルール**:
          - 上記の「displayText」と全く同じ内容を、**すべてひらがな**に変換してください。
          - 漢字、カタカナ、アルファベット、数字は**一切使用禁止**です。すべてひらがなにしてください。
          - 句読点（、。）と猫の名前を囲む「」だけは例外として使用を許可します。
          - **重要**: 「愛称」という単語の読みは「あいしょう」です。
      
      4.  **情報源の限定**:
          - 提供されたPDFと画像の情報を元に回答してください。あなたの一般的な知識は絶対に使わないでください。
          - わからない場合は、displayTextとspeechTextの両方に「申し訳ございません。わかりません。」とだけ入れてください。

      # 出力前の最終チェック
      - JSON形式は正しいか？
      - displayTextに曖昧な表現（～そう、～よう）は含まれていないか？
      - speechTextは、句読点と「」以外、すべてひらがなか？
    `;

    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★ ここが根本的な修正点です ★
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    
    // 1. モデルを初期化する際に、システムへの指示を正しく `systemInstruction` として渡す
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemInstruction,
    });

    // 2. AIに渡す `promptParts` には、ユーザーからの入力（ファイルや質問テキスト）のみを含める
    const promptParts = [
      fileToGenerativePart(pdfPath, "application/pdf"),
    ];
    if (targetImagePart) {
      promptParts.push(targetImagePart);
    }
    promptParts.push(userQuestion);

    // 3. ユーザーからの入力パーツを渡して、AIに応答を生成させる
    const result = await model.generateContent(promptParts);
    const rawResponseText = result.response.text();

    // 4. AIがJSON以外の余計なテキストを返しても、JSON部分だけを抜き出す頑丈な処理
    const jsonMatch = rawResponseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("AIからのレスポンスにJSONが見つかりませんでした:", rawResponseText);
      throw new Error("AIが予期せぬ形式で応答しました。");
    }
    const jsonString = jsonMatch[0];

    try {
      JSON.parse(jsonString); // 念のため、JSONとして正しいかチェック
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(jsonString);
    } catch (parseError) {
      console.error("AIが生成したJSONのパースに失敗しました:", parseError, jsonString);
      throw new Error("AIが不正な形式のJSONを生成しました。");
    }

  } catch (error) {
    // ターミナルに、より詳細なエラー情報を表示するように変更
    console.error('[/ask] 処理中にエラーが発生しました:', error);
    res.status(500).json({ error: 'AIとの通信中にエラーが発生しました。詳細はサーバーログを確認してください。' });
  }
});

// favicon.ico へのリクエストを無視する（コンソールの404エラー対策）
app.get('/favicon.ico', (req, res) => res.status(204).send());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました。`);
});

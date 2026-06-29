const { google } = require('googleapis');
const mammoth = require('mammoth');
const axios = require('axios');

const FOLDER_ID = '18-segJKNLpCFdGpn_TlqHLTE9J2fypwR';
const SUPABASE_URL = 'https://hhcubvixldieuwdeqnwc.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoY3Vidml4bGRpZXV3ZGVxbndjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NjcyNDYsImV4cCI6MjA5MTE0MzI0Nn0.zkWxfm0FugSEL9zW6pwDFWPqmRJ3ystOZfU8yRL2lPo';
const FN = `${SUPABASE_URL}/functions/v1/plantoflife-memory`;

async function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

async function callApi(payload) {
  const r = await axios.post(FN, payload, {
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON,
      'Authorization': `Bearer ${ANON}`,
      'x-app-secret': process.env.APP_SECRET,
    },
  });
  return r.data;
}

async function main() {
  const auth = await getAuth();
  const drive = google.drive({ version: 'v3', auth });

  // 台灣時間今天起點
  const now = new Date();
  const twOffset = 8 * 60 * 60 * 1000;
  const twNow = new Date(now.getTime() + twOffset);
  const todayTW = twNow.toISOString().split('T')[0];
  const todayStart = new Date(`${todayTW}T00:00:00+08:00`).toISOString();

  console.log(`掃描台灣時間 ${todayTW} 修改的 .docx 檔案...`);

  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and modifiedTime >= '${todayStart}' and trashed = false and mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'`,
    fields: 'files(id, name, modifiedTime)',
    pageSize: 50,
  });

  const files = res.data.files || [];
  console.log(`找到 ${files.length} 個檔案`);

  for (const file of files) {
    console.log(`\n處理: ${file.name}`);
    try {
      // 下載 docx
      const dlRes = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      );

      // 解析文字
      const { value: text } = await mammoth.extractRawText({ buffer: Buffer.from(dlRes.data) });
      if (!text.trim()) { console.log('  跳過（空內容）'); continue; }

      // AI 分類
      const suggest = await callApi({ action: 'suggest', content: text.slice(0, 2000) });
      const category = suggest.category || '未分類';
      const tags = [...(suggest.tags || []), 'google-drive'];

      // 存入星系
      await callApi({ action: 'commit', content: text, category, tags, source: 'google-drive' });
      console.log(`  ✓ 分類：${category}，標籤：${tags.join(', ')}`);
    } catch (err) {
      console.error(`  ✗ 失敗：${err.message}`);
    }
  }

  console.log('\n同步完成');
}

main().catch(e => { console.error(e); process.exit(1); });

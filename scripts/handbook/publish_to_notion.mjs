/* global Blob, FormData, URL, console, fetch, process */

import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const NOTION_VERSION = '2026-03-11';
const repoRoot = process.cwd();
const handbookDir = path.join(repoRoot, 'docs/handbook');
const screenshotDir = path.join(repoRoot, 'artifacts/handbook/notion-screenshots');
const notionToken = process.env.NOTION_API_KEY;
const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
const loginEmail = process.env.HANDBOOK_LOGIN_EMAIL;
const loginPassword = process.env.HANDBOOK_LOGIN_PASSWORD;

if (!notionToken) {
  throw new Error('NOTION_API_KEY is required');
}

if (!parentPageId) {
  throw new Error('NOTION_PARENT_PAGE_ID is required');
}

if (!loginEmail || !loginPassword) {
  throw new Error('HANDBOOK_LOGIN_EMAIL and HANDBOOK_LOGIN_PASSWORD are required');
}

const headers = {
  Authorization: `Bearer ${notionToken}`,
  'Notion-Version': NOTION_VERSION,
};

const handbookFiles = [
  '00-handbook-index.md',
  '01-login-and-navigation.md',
  '02-dashboard.md',
  '03-property-and-room.md',
  '04-tenant-and-lease.md',
  '05-billing-and-payment.md',
  '06-meter-and-extra-fees.md',
  '07-repair-workspace.md',
  '08-reports-and-exports.md',
  '09-faq-and-permissions.md',
];

const screenshotPlan = [
  { page: '00-handbook-index.md', slug: '00-workbench-overview', title: '工作台總覽', path: '/' },
  { page: '01-login-and-navigation.md', slug: '01-login', title: '登入頁', path: '/login', beforeLogin: true },
  { page: '01-login-and-navigation.md', slug: '01-navigation', title: '側邊選單與目前物業', path: '/' },
  { page: '02-dashboard.md', slug: '02-dashboard', title: '工作台', path: '/' },
  { page: '03-property-and-room.md', slug: '03-property-list', title: '物業管理', path: '/properties' },
  { page: '03-property-and-room.md', slug: '03-property-dashboard', title: '物業工作台', path: '/properties/{propertyId}' },
  { page: '03-property-and-room.md', slug: '03-room-list', title: '房間清冊', path: '/properties/{propertyId}/rooms' },
  { page: '03-property-and-room.md', slug: '03-room-create', title: '新增房間', path: '/properties/{propertyId}/rooms/new' },
  { page: '04-tenant-and-lease.md', slug: '04-tenant-roster', title: '租客與租約名冊', path: '/properties/{propertyId}/tenants' },
  { page: '05-billing-and-payment.md', slug: '05-billing', title: '帳單與抄表', path: '/properties/{propertyId}/billing' },
  { page: '06-meter-and-extra-fees.md', slug: '06-meter-history', title: '物業電表歷史', path: '/properties/{propertyId}/billing/meter-history' },
  { page: '07-repair-workspace.md', slug: '07-journal-repair', title: '日誌與維修', path: '/properties/{propertyId}/journal' },
  { page: '08-reports-and-exports.md', slug: '08-reports', title: '報表中心', path: '/properties/{propertyId}/reports' },
  { page: '09-faq-and-permissions.md', slug: '09-account', title: '我的帳號', path: '/account' },
  { page: '09-faq-and-permissions.md', slug: '09-users', title: '成員與權限', path: '/admin/members' },
];

function notionId(id) {
  return id.replace(/-/g, '');
}

async function notionFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function createMarkdownPage(parent, markdown) {
  return notionFetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent,
      markdown,
    }),
  });
}

async function appendBlocks(blockId, children) {
  for (let index = 0; index < children.length; index += 80) {
    const chunk = children.slice(index, index + 80);
    await notionFetch(`https://api.notion.com/v1/blocks/${blockId}/children`, {
      method: 'PATCH',
      body: JSON.stringify({ children: chunk }),
    });
  }
}

async function uploadFile(filePath) {
  const createResponse = await notionFetch('https://api.notion.com/v1/file_uploads', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), path.basename(filePath));

  const sendResponse = await fetch(createResponse.upload_url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_VERSION,
    },
    body: form,
  });
  const data = await sendResponse.json();
  if (!sendResponse.ok) {
    throw new Error(`file upload failed: ${sendResponse.status} ${JSON.stringify(data)}`);
  }
  return data.id;
}

function paragraph(text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  };
}

function heading(text) {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  };
}

function imageBlock(fileUploadId, caption) {
  return {
    object: 'block',
    type: 'image',
    image: {
      type: 'file_upload',
      file_upload: { id: fileUploadId },
      caption: [{ type: 'text', text: { content: caption } }],
    },
  };
}

async function waitStable(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(900);
}

async function login(page) {
  await page.goto('http://localhost:5173/login');
  await waitStable(page);
  if (await page.getByLabel('電子信箱').count()) {
    await page.getByLabel('電子信箱').fill(loginEmail);
    await page.getByLabel('密碼').fill(loginPassword);
    await page.getByRole('button', { name: /登\s*入/ }).click();
    await page.waitForURL('**/');
    await waitStable(page);
  }
}

async function getPropertyId(page) {
  await page.goto('http://localhost:5173/');
  await waitStable(page);
  await page.getByText('物業工作台').click();
  await page.waitForURL(/\/properties\/[^/]+$/);
  return new URL(page.url()).pathname.split('/')[2];
}

async function captureScreenshots() {
  await fs.mkdir(screenshotDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  await page.goto('http://localhost:5173/login');
  await waitStable(page);
  await page.screenshot({
    path: path.join(screenshotDir, '01-login.jpg'),
    type: 'jpeg',
    quality: 72,
    fullPage: false,
  });

  await login(page);
  const propertyId = await getPropertyId(page);
  const captured = [];

  for (const item of screenshotPlan.filter((entry) => !entry.beforeLogin)) {
    const targetPath = item.path.replace('{propertyId}', propertyId);
    await page.goto(`http://localhost:5173${targetPath}`);
    await waitStable(page);
    const filePath = path.join(screenshotDir, `${item.slug}.jpg`);
    await page.screenshot({ path: filePath, type: 'jpeg', quality: 72, fullPage: false });
    captured.push({ ...item, filePath });
  }

  captured.push({
    ...screenshotPlan.find((entry) => entry.beforeLogin),
    filePath: path.join(screenshotDir, '01-login.jpg'),
  });

  await browser.close();
  return captured;
}

function sanitizeMarkdown(markdown) {
  return markdown
    .replace(/^\[截圖：.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function publish() {
  const screenshots = await captureScreenshots();
  const rootTitle = `# STDS 管理後台使用者手冊 - 2026-05-17 本地驗收版`;
  const rootPage = await createMarkdownPage(
    { type: 'page_id', page_id: notionId(parentPageId) },
    `${rootTitle}\n\n本頁由本地 Markdown 初版發布，子頁依章節拆分。截圖為本地開發環境畫面，用於輔助操作辨識。\n\n${handbookFiles.map((file) => `- ${file.replace('.md', '')}`).join('\n')}`,
  );

  const pageMap = new Map();
  for (const file of handbookFiles) {
    const raw = await fs.readFile(path.join(handbookDir, file), 'utf8');
    const page = await createMarkdownPage(
      { type: 'page_id', page_id: rootPage.id },
      sanitizeMarkdown(raw),
    );
    pageMap.set(file, page.id);
  }

  const screenshotsByPage = new Map();
  for (const screenshot of screenshots) {
    if (!screenshot.page) {
      continue;
    }
    const items = screenshotsByPage.get(screenshot.page) ?? [];
    items.push(screenshot);
    screenshotsByPage.set(screenshot.page, items);
  }

  for (const [file, items] of screenshotsByPage.entries()) {
    const pageId = pageMap.get(file);
    if (!pageId) {
      continue;
    }
    const children = [heading('截圖附件')];
    for (const item of items) {
      const uploadId = await uploadFile(item.filePath);
      children.push(paragraph(item.title));
      children.push(imageBlock(uploadId, item.title));
    }
    await appendBlocks(pageId, children);
  }

  console.log(JSON.stringify({
    rootPageUrl: rootPage.url,
    rootPageId: rootPage.id,
    childPages: Object.fromEntries(pageMap),
    screenshots: screenshots.map((item) => path.relative(repoRoot, item.filePath)),
  }, null, 2));
}

publish().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

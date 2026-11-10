# Web Crypto API 使用场景详解

> 浏览器原生密码学接口，涵盖密码哈希、对称加密、非对称加密/签名、安全随机数、JWT 签名与验证，附完整代码示例。

---

## 目录

- [概述](#概述)
- [0. 通用工具函数](#0-通用工具函数)
- [1. 用户密码加密（PBKDF2、SHA-256）](#1-用户密码加密pbkdf2sha-256)
- [2. 对称加密/解密（AES）](#2-对称加密解密aes)
- [3. 非对称加密/签名（RSA、ECDSA）](#3-非对称加密签名rsaecdsa)
- [4. 安全随机数生成（token、验证码）](#4-安全随机数生成token验证码)
- [5. 签名与验证（JWT 的签名部分）](#5-签名与验证jwt-的签名部分)
- [6. 速查表与最佳实践](#6-速查表与最佳实践)

---

## 概述

Web Crypto API 由三部分组成：

| 接口 | 用途 |
|---|---|
| `crypto.subtle` | 哈希、加解密、签名、密钥派生等（SubtleCrypto） |
| `crypto.getRandomValues()` | 密码学安全随机数 |
| `crypto.randomUUID()` | 生成 UUID v4 |

### 为什么更安全？

- 由浏览器底层（C++/Rust）实现，不是纯 JS 库，速度快，也不易受时序攻击。
- 密钥可设为**不可导出（`extractable: false`）**，JS 代码无法读出密钥原文，能有效抵御 XSS 窃取密钥。
- 运行环境：**仅限安全上下文（HTTPS 或 localhost）**。Node 19+、Deno、Cloudflare Workers、Web Worker 中也可使用。

### 场景总览

| # | 场景 | 核心算法 |
|---|---|---|
| 1 | 用户密码加密 | PBKDF2、SHA-256 |
| 2 | 对称加密/解密 | AES-GCM |
| 3 | 非对称加密/签名 | RSA-OAEP、ECDSA、RSA-PSS、ECDH |
| 4 | 安全随机数 | `getRandomValues`、`randomUUID` |
| 5 | JWT 签名与验证 | HS256、ES256、RS256 |

---

## 0. 通用工具函数

后面的示例都会用到这些编码转换函数：

```js
const enc = new TextEncoder();
const dec = new TextDecoder();

// ArrayBuffer -> Hex
const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// ArrayBuffer <-> Base64
function toBase64(buf) {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
}
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// ArrayBuffer <-> Base64URL（JWT 使用）
const toBase64Url = (buf) =>
  toBase64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (s) =>
  fromBase64(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));

// 常量时间比较，防止时序攻击
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
```

---

## 1. 用户密码加密（PBKDF2、SHA-256）

### 1.1 为什么不能直接用 SHA-256 存密码

SHA-256 是**快速哈希**，GPU 每秒能算几十亿次，彩虹表和暴力破解都很容易。密码存储必须用**慢哈希 + 随机盐**，Web Crypto 中对应的就是 **PBKDF2**（迭代次数越高越安全）。

> ⚠️ 说明：Web Crypto 不支持 bcrypt、scrypt、Argon2。如果可以选择，服务端存储密码优先用 Argon2id。PBKDF2 的好处是 FIPS 合规、各平台原生可用。

### 1.2 PBKDF2 密码哈希与校验

```js
const PBKDF2_ITERATIONS = 600_000; // OWASP 对 PBKDF2-HMAC-SHA256 的推荐值

async function hashPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  salt = salt ?? crypto.getRandomValues(new Uint8Array(16)); // 16 字节随机盐

  // 1) 把密码导入为 PBKDF2 的"密钥材料"
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // 2) 派生 256 位哈希
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    256
  );

  return { salt: toBase64(salt), hash: toBase64(bits), iterations };
}

async function verifyPassword(password, record) {
  const { hash } = await hashPassword(
    password,
    fromBase64(record.salt),
    record.iterations
  );
  return timingSafeEqual(fromBase64(hash), fromBase64(record.hash));
}

// 使用
const record = await hashPassword('MyP@ssw0rd!');
console.log(record);
// { salt: "...", hash: "...", iterations: 600000 }

console.log(await verifyPassword('MyP@ssw0rd!', record)); // true
console.log(await verifyPassword('wrong', record));       // false
```

**要点：**

- 每个用户用**独立随机盐**，盐不需要保密，和哈希一起存储。
- 把 `iterations` 一起存下来，将来提高迭代次数时可以平滑迁移。
- 前端哈希**不能替代**服务端哈希：如果前端只发哈希值，那哈希值本身就成了"密码"。前端 PBKDF2 的典型用途是**端到端加密中派生加密密钥**（见 2.3）。

### 1.3 SHA-256 的正确用途：完整性校验、指纹

```js
async function sha256(data) {
  const buf = typeof data === 'string' ? enc.encode(data) : data;
  return toHex(await crypto.subtle.digest('SHA-256', buf));
}

console.log(await sha256('hello'));
// 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824

// 计算文件哈希（用于上传校验、去重）
async function hashFile(file) {
  return sha256(await file.arrayBuffer());
}
```

支持的算法：`SHA-1`（不推荐）、`SHA-256`、`SHA-384`、`SHA-512`。

---

## 2. 对称加密/解密（AES）

对称加密用同一把密钥加密和解密，适合加密大量数据。**首选 AES-GCM**：它同时提供**机密性 + 完整性**（带认证标签），数据被篡改时解密会直接抛错。

### 2.1 基础用法：AES-GCM

```js
// 生成 256 位 AES 密钥
async function generateAesKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // 是否可导出；不需要导出时设为 false 更安全
    ['encrypt', 'decrypt']
  );
}

async function aesEncrypt(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // GCM 推荐 12 字节 IV
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return { iv: toBase64(iv), data: toBase64(ciphertext) };
}

async function aesDecrypt(key, { iv, data }) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    key,
    fromBase64(data)
  );
  return dec.decode(plaintext);
}

// 使用
const key = await generateAesKey();
const packed = await aesEncrypt(key, '这是一段机密信息 🔐');
console.log(packed); // { iv: "...", data: "..." }
console.log(await aesDecrypt(key, packed)); // 这是一段机密信息 🔐
```

**要点：**

- **同一把密钥下，IV 绝对不能重复**，每次加密都重新随机生成。IV 不需要保密，随密文一起存储。
- 密文被篡改时 `decrypt` 会抛出 `OperationError`，要用 `try/catch` 处理。
- 可通过 `additionalData` 绑定上下文（如用户 ID），密文被挪到别处使用时会校验失败：

```js
await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv, additionalData: enc.encode('user:123') },
  key,
  data
);
```

### 2.2 密钥的导出与导入（持久化）

```js
// 导出为 Base64（仅当 extractable = true）
const raw = await crypto.subtle.exportKey('raw', key);
const keyB64 = toBase64(raw);

// 导入
const importedKey = await crypto.subtle.importKey(
  'raw',
  fromBase64(keyB64),
  { name: 'AES-GCM' },
  false, // 导入后设为不可导出
  ['encrypt', 'decrypt']
);
```

> 💡 `CryptoKey` 对象本身可以直接存入 **IndexedDB**（结构化克隆），并保持"不可导出"，这是在浏览器中保存密钥最安全的方式，不要把密钥明文放进 localStorage。

### 2.3 基于用户密码加密（PBKDF2 + AES-GCM）

这是端到端加密、加密笔记、密码管理器等场景的典型做法：用户密码 → 派生密钥 → 加密数据。

```js
async function deriveKeyFromPassword(password, salt, iterations = 600_000) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// 加密：输出 salt(16) + iv(12) + ciphertext，打包成一个 Base64 字符串
async function encryptWithPassword(password, plaintext) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassword(password, salt);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  );

  const out = new Uint8Array(salt.length + iv.length + ct.length);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(ct, 28);
  return toBase64(out);
}

async function decryptWithPassword(password, packed) {
  const bytes = fromBase64(packed);
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const ct = bytes.slice(28);
  const key = await deriveKeyFromPassword(password, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return dec.decode(pt);
}

// 使用
const secret = await encryptWithPassword('my-password', '我的私密日记');
console.log(await decryptWithPassword('my-password', secret)); // 我的私密日记

try {
  await decryptWithPassword('wrong-password', secret);
} catch {
  console.log('密码错误或数据被篡改');
}
```

### 2.4 加密文件

```js
async function encryptFile(file, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, await file.arrayBuffer()
  );
  // IV 拼在密文前面，生成可下载的 Blob
  return new Blob([iv, ct], { type: 'application/octet-stream' });
}

async function decryptFile(blob, key) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct); // 返回 ArrayBuffer
}
```

> 此方式会把整个文件读入内存，超大文件（数百 MB 以上）需要分块加密，每块使用独立 IV。

### 2.5 其他 AES 模式

| 模式 | 说明 |
|---|---|
| `AES-GCM` | ✅ 推荐，带认证 |
| `AES-CBC` | 无认证，需自行配合 HMAC，不推荐新项目使用 |
| `AES-CTR` | 流式模式，无认证 |
| `AES-KW` | 密钥包装（wrapKey/unwrapKey） |

---

## 3. 非对称加密/签名（RSA、ECDSA）

非对称加密使用**公钥/私钥对**：公钥可以公开，私钥自己保管。

### 3.1 RSA-OAEP：公钥加密，私钥解密

```js
async function generateRsaKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048, // 至少 2048，高安全场景用 4096
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
}

const { publicKey, privateKey } = await generateRsaKeyPair();

// 公钥加密
const ct = await crypto.subtle.encrypt(
  { name: 'RSA-OAEP' },
  publicKey,
  enc.encode('Hello RSA')
);

// 私钥解密
const pt = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, ct);
console.log(dec.decode(pt)); // Hello RSA
```

**限制：** RSA 只能加密很短的数据（RSA-2048 + SHA-256 最多约 190 字节）。实际应用中采用**混合加密**：用 AES 加密数据，再用 RSA 加密 AES 密钥。

### 3.2 混合加密（RSA + AES）

```js
async function hybridEncrypt(recipientPublicKey, message) {
  // 1) 生成一次性 AES 密钥并加密消息
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, aesKey, enc.encode(message)
  );

  // 2) 用 RSA 公钥加密 AES 密钥
  const rawAes = await crypto.subtle.exportKey('raw', aesKey);
  const encKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' }, recipientPublicKey, rawAes
  );

  return { encKey: toBase64(encKey), iv: toBase64(iv), data: toBase64(data) };
}

async function hybridDecrypt(privateKey, { encKey, iv, data }) {
  const rawAes = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' }, privateKey, fromBase64(encKey)
  );
  const aesKey = await crypto.subtle.importKey(
    'raw', rawAes, { name: 'AES-GCM' }, false, ['decrypt']
  );
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) }, aesKey, fromBase64(data)
  );
  return dec.decode(pt);
}
```

### 3.3 密钥导出：SPKI / PKCS8 / PEM / JWK

```js
// 公钥 → SPKI，私钥 → PKCS8（标准二进制格式，可转 PEM）
const spki = await crypto.subtle.exportKey('spki', publicKey);
const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);

function toPem(buf, label) {
  const b64 = toBase64(buf).match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----`;
}
console.log(toPem(spki, 'PUBLIC KEY'));
console.log(toPem(pkcs8, 'PRIVATE KEY'));

// 从 PEM 导入公钥
function pemToBuffer(pem) {
  const b64 = pem.replace(/-----(BEGIN|END)[\w\s]+-----/g, '').replace(/\s/g, '');
  return fromBase64(b64);
}
const imported = await crypto.subtle.importKey(
  'spki',
  pemToBuffer(toPem(spki, 'PUBLIC KEY')),
  { name: 'RSA-OAEP', hash: 'SHA-256' },
  true,
  ['encrypt']
);

// JWK 格式（JSON，便于存储和传输）
const jwk = await crypto.subtle.exportKey('jwk', publicKey);
```

### 3.4 ECDSA：椭圆曲线签名（推荐）

相比 RSA，ECDSA 密钥更短、速度更快：P-256 的 256 位密钥安全强度约等于 RSA-3072。

```js
async function generateEcdsaKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, // 可选 P-256 / P-384 / P-521
    true,
    ['sign', 'verify']
  );
}

const ecKeys = await generateEcdsaKeyPair();

// 签名
const message = enc.encode('转账 100 元给 Alice');
const signature = await crypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' },
  ecKeys.privateKey,
  message
);

// 验证
const valid = await crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  ecKeys.publicKey,
  signature,
  message
);
console.log(valid); // true

// 消息被篡改后验证失败
const tampered = await crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  ecKeys.publicKey,
  signature,
  enc.encode('转账 9999 元给 Alice')
);
console.log(tampered); // false
```

### 3.5 RSA 签名：RSA-PSS 与 RSASSA-PKCS1-v1_5

```js
// RSA-PSS（推荐的 RSA 签名方案）
const pssKeys = await crypto.subtle.generateKey(
  {
    name: 'RSA-PSS',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify']
);

const sig = await crypto.subtle.sign(
  { name: 'RSA-PSS', saltLength: 32 },
  pssKeys.privateKey,
  enc.encode('data')
);
const ok = await crypto.subtle.verify(
  { name: 'RSA-PSS', saltLength: 32 },
  pssKeys.publicKey,
  sig,
  enc.encode('data')
);
```

> `RSASSA-PKCS1-v1_5` 的用法类似，用于兼容 JWT 的 RS256 等传统系统。

### 3.6 ECDH：密钥协商（端到端加密的基础）

通信双方各自生成密钥对、交换公钥，就能各自算出**相同的共享密钥**，而无需在网络上传输密钥。

```js
const params = { name: 'ECDH', namedCurve: 'P-256' };
const alice = await crypto.subtle.generateKey(params, true, ['deriveKey']);
const bob = await crypto.subtle.generateKey(params, true, ['deriveKey']);

// 双方各用"自己的私钥 + 对方的公钥"派生 AES 密钥
async function deriveShared(myPrivate, theirPublic) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublic },
    myPrivate,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

const aliceShared = await deriveShared(alice.privateKey, bob.publicKey);
const bobShared = await deriveShared(bob.privateKey, alice.publicKey);

// 两个密钥完全一致
const a = toHex(await crypto.subtle.exportKey('raw', aliceShared));
const b = toHex(await crypto.subtle.exportKey('raw', bobShared));
console.log(a === b); // true
```

---

## 4. 安全随机数生成（token、验证码）

### 4.1 为什么不能用 `Math.random()`

`Math.random()` 是**伪随机数**，状态可被推测，**绝不能用于**安全场景。`crypto.getRandomValues()` 使用操作系统级别的加密安全随机源（CSPRNG）。

### 4.2 基础用法

```js
// 随机字节
const bytes = crypto.getRandomValues(new Uint8Array(32));

// UUID v4
console.log(crypto.randomUUID()); // "36b8f84d-df4e-4d49-b662-bcde71a8764f"
```

> ⚠️ `getRandomValues` 单次最多填充 65536 字节。

### 4.3 生成各种 Token

```js
// 十六进制 token（64 个字符）
const randomHex = (bytes = 32) =>
  toHex(crypto.getRandomValues(new Uint8Array(bytes)));

// URL 安全的 Base64 token（适合放进链接、Cookie）
const randomToken = (bytes = 32) =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));

console.log(randomHex());   // "a3f1...（64 字符）"
console.log(randomToken()); // "X9kP2...（43 字符）"

// 自定义字符集的随机字符串（避免取模偏差，使用拒绝采样）
function randomString(length, charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') {
  const n = charset.length;
  const limit = Math.floor(256 / n) * n; // 超过 limit 的字节丢弃
  let result = '';
  while (result.length < length) {
    const buf = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of buf) {
      if (b < limit && result.length < length) result += charset[b % n];
    }
  }
  return result;
}

console.log(randomString(8)); // "K7NQ3XMA"（去掉了易混淆的 0/O/1/I）
```

### 4.4 生成数字验证码（无偏差）

```js
// 直接用 `值 % 10^n` 会有轻微的取模偏差，这里用拒绝采样保证均匀
function randomCode(digits = 6) {
  const max = 10 ** digits;
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  let n;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return String(n % max).padStart(digits, '0');
}

console.log(randomCode(6)); // "048213"

// 指定范围的随机整数 [min, max)
function randomInt(min, max) {
  const range = max - min;
  const limit = Math.floor(2 ** 32 / range) * range;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return min + (buf[0] % range);
}
```

**典型用途：** CSRF Token、会话 ID、邮件重置链接、一次性验证码、盐值、IV、Nonce。

> 验证码相关的有效期、尝试次数限制、频率限制等必须在**服务端**实现；前端生成的验证码不能用于身份校验。

---

## 5. 签名与验证（JWT 的签名部分）

JWT 结构：`base64url(header).base64url(payload).base64url(signature)`，签名对象是前两段拼接的字符串。

### 5.1 HS256（HMAC-SHA256，对称密钥）

```js
const b64uJson = (obj) => toBase64Url(enc.encode(JSON.stringify(obj)));

async function importHmacKey(secret, usages) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages
  );
}

async function signJwt(payload, secret, expiresInSec = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, exp: now + expiresInSec, ...payload };

  const signingInput = `${b64uJson(header)}.${b64uJson(body)}`;
  const key = await importHmacKey(secret, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));

  return `${signingInput}.${toBase64Url(sig)}`;
}

async function verifyJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const [h, p, s] = parts;

  // 必须校验 alg，防止"alg 降级/none"攻击
  const header = JSON.parse(dec.decode(fromBase64Url(h)));
  if (header.alg !== 'HS256') throw new Error('Unsupported alg');

  const key = await importHmacKey(secret, ['verify']);
  const valid = await crypto.subtle.verify(
    'HMAC', key, fromBase64Url(s), enc.encode(`${h}.${p}`)
  ); // 内部是常量时间比较
  if (!valid) throw new Error('Invalid signature');

  const payload = JSON.parse(dec.decode(fromBase64Url(p)));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }
  return payload;
}

// 使用
const token = await signJwt({ sub: 'user_123', role: 'admin' }, 'my-super-secret-key-32bytes!!!!!', 60);
console.log(token);
console.log(await verifyJwt(token, 'my-super-secret-key-32bytes!!!!!'));
// { iat: ..., exp: ..., sub: 'user_123', role: 'admin' }
```

### 5.2 ES256（ECDSA P-256，非对称）

非对称签名的优势：**签发方持私钥，验证方只需公钥**，适合多服务、前端验证场景。

Web Crypto 的 ECDSA 签名输出就是 JWT 要求的 **IEEE P1363（r‖s 拼接）格式**，可以直接使用。

```js
async function signJwtES256(payload, privateKey) {
  const header = { alg: 'ES256', typ: 'JWT' };
  const signingInput = `${b64uJson(header)}.${b64uJson(payload)}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    enc.encode(signingInput)
  );
  return `${signingInput}.${toBase64Url(sig)}`; // sig 为 64 字节
}

async function verifyJwtES256(token, publicKey) {
  const [h, p, s] = token.split('.');
  const header = JSON.parse(dec.decode(fromBase64Url(h)));
  if (header.alg !== 'ES256') throw new Error('Unsupported alg');

  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    fromBase64Url(s),
    enc.encode(`${h}.${p}`)
  );
  if (!valid) throw new Error('Invalid signature');
  return JSON.parse(dec.decode(fromBase64Url(p)));
}

// 使用
const { privateKey, publicKey } = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
);
const t = await signJwtES256({ sub: 'user_123', exp: Math.floor(Date.now() / 1000) + 3600 }, privateKey);
console.log(await verifyJwtES256(t, publicKey));
```

### 5.3 RS256（RSASSA-PKCS1-v1_5）

```js
const rsaKeys = await crypto.subtle.generateKey(
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify']
);

// 签名/验证时 algorithm 参数直接用字符串即可
const sig256 = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', rsaKeys.privateKey, enc.encode('header.payload'));
const ok256 = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', rsaKeys.publicKey, sig256, enc.encode('header.payload'));
```

### 5.4 JWT 使用注意事项

- **HS256 的密钥不要放在前端**：任何下发到浏览器的密钥都等于公开。浏览器端通常只做**验证**（用公钥）或解码展示，**签发应由服务端完成**。
- 验证时必须**白名单校验 `alg`**，不要信任 token 里声明的算法。
- 一定要检查 `exp`、`nbf`、`iss`、`aud` 等声明。
- 生产环境推荐使用成熟库（如 `jose`，它底层就是基于 Web Crypto），自己实现容易遗漏细节。

---

## 6. 速查表与最佳实践

### 6.1 算法选型速查

| 场景 | 推荐算法 | 关键 API |
|---|---|---|
| 密码存储 | PBKDF2（≥60 万次迭代）+ 随机盐 | `deriveBits` |
| 文件/数据指纹 | SHA-256 / SHA-512 | `digest` |
| 数据加密 | AES-256-GCM + 随机 12 字节 IV | `encrypt` / `decrypt` |
| 密码派生加密密钥 | PBKDF2 → AES-GCM | `deriveKey` |
| 小数据公钥加密 | RSA-OAEP（2048+） | `encrypt` / `decrypt` |
| 大数据公钥加密 | 混合加密：RSA/ECDH + AES-GCM | `deriveKey` |
| 数字签名 | ECDSA P-256 / RSA-PSS | `sign` / `verify` |
| 消息认证、JWT HS256 | HMAC-SHA256 | `sign` / `verify` |
| 随机 token / 验证码 | CSPRNG | `getRandomValues` / `randomUUID` |

### 6.2 通用安全原则

1. **不要自己发明加密方案**：使用标准算法和标准组合。
2. **IV/Nonce 不复用**：AES-GCM 重复 IV 会导致密钥泄露级别的后果。
3. **密钥尽量设为 `extractable: false`**，并通过 IndexedDB 存储 `CryptoKey` 对象。
4. **前端加密不等于安全**：如果页面本身被 XSS 攻破，攻击者可以直接调用你的加密函数。因此 CSP、输入过滤依然必不可少。
5. **所有 `subtle` 方法都返回 Promise**，注意 `await` 和错误处理（解密/验证失败会抛异常或返回 `false`）。
6. 必须在 **HTTPS 或 localhost** 下运行，否则 `crypto.subtle` 为 `undefined`。

---

## 延伸方向

- 封装成可直接复用的 TypeScript 工具类
- 浏览器 + Node.js 服务端的端到端加密完整示例
- 用 IndexedDB 持久化 `CryptoKey` 的完整代码

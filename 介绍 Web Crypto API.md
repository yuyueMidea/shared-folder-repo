Web Crypto API 是 JavaScript 内置的一组密码学接口，可以完成哈希、密钥生成、加密解密、数字签名、签名验证和安全随机数生成。浏览器原生提供，通常不需要安装第三方加密库；Node.js 也提供兼容接口。[w3.org](https://www.w3.org/TR/webcrypto/?utm_source=chatgpt.com)

理解它的关键，是先分清几种操作的目的：

| 操作 | 解决什么问题 | 是否需要密钥 | 是否可以恢复原文 | 常见算法 |
|---|---|---|---|---|
| 普通哈希 | 给数据生成摘要，检查内容是否一致 | 否 | 不可逆，但低熵输入可以被猜中 | SHA-256 |
| 口令派生 | 提高猜测密码的成本，或从密码生成密钥 | 使用密码、盐及计算参数 | 不可逆，但仍可能被离线猜测 | PBKDF2 |
| 对称加密 | 保护数据内容 | 双方持有同一密钥 | 可以 | AES-GCM |
| 非对称加密 | 让持有私钥的人才能解密 | 公钥、私钥 | 可以，由私钥解密 | RSA-OAEP |
| 数字签名 | 验证数据由对应私钥签发，且未被修改 | 私钥签名、公钥验证 | 不负责隐藏或恢复原文 | ECDSA、RSA-PSS |
| 消息认证码 | 在共享密钥的双方之间验证完整性和真实性 | 同一秘密密钥 | 不负责隐藏原文 | HMAC-SHA-256 |
| 安全随机数 | 生成难以预测的随机值 | 调用时通常不需要提供 | 不适用 | `getRandomValues()` |

你提到的五种场景，都能使用它，但实际系统还需要正确处理密钥保存、身份认证和数据格式。

**先准备运行环境和公共工具。**

浏览器中的 `crypto.subtle` 应在 HTTPS 或 `http://localhost` 这样的安全上下文中使用。下面全部是 JavaScript，不使用 TypeScript，可以放进同一个 `<script type="module">` 中依次运行；示例中的顶层 `await` 需要模块环境。`getRandomValues()` 还有一些不同的上下文限制，不应据此省略网站的 HTTPS。[w3.org](https://www.w3.org/TR/webcrypto/?utm_source=chatgpt.com)

```html
<script type="module">
  // 先粘贴公共工具，再粘贴需要运行的案例。
</script>
```

公共工具：

```js
const wc = globalThis.crypto;

if (!wc?.subtle) {
  throw new Error("当前环境不支持 Web Crypto，请使用 HTTPS 或 localhost");
}

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

// 文本 → UTF-8 字节
const utf8 = text => enc.encode(text);

// 生成随机字节。本教程只用于少量随机数据。
function randomBytes(length) {
  return wc.getRandomValues(new Uint8Array(length));
}

// ArrayBuffer / Uint8Array → Base64URL
function toB64u(data) {
  const bytes =
    data instanceof Uint8Array ? data : new Uint8Array(data);

  let binary = "";

  // 分块，避免大数组展开导致调用栈溢出。
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + 0x8000)
    );
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Base64URL → Uint8Array
function fromB64u(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]*$/.test(value) ||
    value.length % 4 === 1
  ) {
    throw new Error("无效的 Base64URL");
  }

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);

  const bytes = Uint8Array.from(
    atob(padded),
    char => char.charCodeAt(0)
  );

  if (toB64u(bytes) !== value) {
    throw new Error("非规范的 Base64URL");
  }

  return bytes;
}

function toHex(data) {
  return Array.from(new Uint8Array(data), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
```

这里需要特别区分：`TextEncoder` 处理字符编码，Base64URL 处理二进制数据的文本表示，**这两者都不提供加密保护**。

Web Crypto 中的大部分密码学操作返回 `Promise`，结果通常是 `ArrayBuffer`；密钥则由 `CryptoKey` 对象表示。

| 方法 | 主要用途 |
|---|---|
| `digest()` | 计算哈希 |
| `generateKey()` | 生成密钥或密钥对 |
| `importKey()` / `exportKey()` | 导入、导出密钥 |
| `deriveBits()` / `deriveKey()` | 派生字节或密钥 |
| `encrypt()` / `decrypt()` | 加密、解密 |
| `sign()` / `verify()` | 生成、验证签名或 MAC |
| `wrapKey()` / `unwrapKey()` | 加密导出密钥、解密导入密钥 |

---

**1．用户密码：SHA-256 和 PBKDF2 各自适合什么**

首先纠正一个容易混淆的说法：登录密码通常应该存储为**带盐的慢速口令哈希**，而不是保存成以后可以解密的密文。

SHA-256 本身计算得很快，适合内容摘要，不适合直接保存用户密码。对于新建的服务端密码存储系统，OWASP 优先建议 Argon2id；PBKDF2 是另一种可用方案，尤其适合有相关兼容或合规要求的环境。浏览器广泛可用的 Web Crypto 接口中，可以直接使用 PBKDF2。[OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html?utm_source=chatgpt.com)

**案例 A：SHA-256 计算文本或文件摘要。**

例如，你的考勤系统导入 CSV 时，可以计算文件摘要，用于提示“这个文件此前已经导入过”。

```js
async function sha256Hex(data) {
  const digest = await wc.subtle.digest("SHA-256", data);
  return toHex(digest);
}

console.log(await sha256Hex(utf8("hello")));
// 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824

console.log(await sha256Hex(utf8("你好，Web Crypto")));

// 浏览器 File 对象
async function hashFile(file) {
  const buffer = await file.arrayBuffer();
  return sha256Hex(buffer);
}

// 假设页面有 <input id="fileInput" type="file">
document.querySelector("#fileInput")?.addEventListener(
  "change",
  async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log("文件名：", file.name);
    console.log("SHA-256：", await hashFile(file));
  }
);
```

这类摘要有几个特点：

- 相同字节得到相同摘要；文件名不同但内容相同，摘要也相同。
- CSV 换行符、BOM 或编码发生变化，也会改变摘要。
- 摘要只能检查内容是否匹配。要防止恶意替换，预期摘要本身必须来自可信渠道。
- `digest()` 不是流式接口，上面的写法会把整个文件读入内存；特别大的文件需要另外设计处理方案。

不要直接这样保存密码：

```js
// 不适合作为登录密码的存储方案：
const passwordHash = await sha256Hex(utf8(password));
```

即使加上盐，单次 SHA-256 仍然太快，不能提供慢速口令派生的抗猜测成本。

**案例 B：PBKDF2 实现注册时派生、登录时验证。**

PBKDF2 可以理解为：

> 用密码、每条记录独立的随机盐和一定计算成本，派生出一段字节。

这里使用 PBKDF2-HMAC-SHA-256、16 字节随机盐、32 字节输出，以及 600,000 次迭代。600,000 是当前 OWASP 对该 PBKDF2 变体给出的建议值；实际部署仍需结合服务器性能、登录并发和限流措施评估。[OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html?utm_source=chatgpt.com)

```js
const PASSWORD_ITERATIONS = 600_000;

async function derivePasswordBits(password, salt, iterations) {
  const material = await wc.subtle.importKey(
    "raw",
    utf8(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const result = await wc.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    material,
    256 // 输出 256 bit，也就是 32 字节
  );

  return new Uint8Array(result);
}

// 教学用比较函数：避免发现首个差异就返回。
// JavaScript/JIT 不保证这种写法具有严格的常量时间特性。
function equalBytes(a, b) {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a[i] ^ b[i];
  }
  return difference === 0;
}

// 注册阶段：生成可存入数据库的记录。
async function createPasswordRecord(password) {
  const salt = randomBytes(16);
  const hash = await derivePasswordBits(
    password,
    salt,
    PASSWORD_ITERATIONS
  );

  return {
    version: 1,
    algorithm: "PBKDF2",
    hashAlgorithm: "SHA-256",
    iterations: PASSWORD_ITERATIONS,
    salt: toB64u(salt),
    hash: toB64u(hash)
  };
}

// 登录阶段：使用数据库记录里的参数重新派生。
async function verifyPassword(password, record) {
  if (
    record.version !== 1 ||
    record.algorithm !== "PBKDF2" ||
    record.hashAlgorithm !== "SHA-256" ||
    !Number.isInteger(record.iterations) ||
    record.iterations < 600_000 ||
    record.iterations > 2_000_000
  ) {
    throw new Error("不支持的口令记录参数");
  }

  const salt = fromB64u(record.salt);
  const expected = fromB64u(record.hash);

  if (salt.length !== 16 || expected.length !== 32) {
    throw new Error("口令记录格式错误");
  }

  const actual = await derivePasswordBits(
    password,
    salt,
    record.iterations
  );

  return equalBytes(actual, expected);
}

// 演示
const passwordRecord =
  await createPasswordRecord("Yuri-demo-password-2026!");

console.log(
  await verifyPassword("Yuri-demo-password-2026!", passwordRecord)
); // true

console.log(
  await verifyPassword("wrong-password", passwordRecord)
); // false
```

这份记录中的 `salt`、算法名和迭代次数都可以公开存储。盐的作用是让相同密码产生不同结果，并阻止攻击者直接复用一套预计算结果；它不是需要藏起来的密钥。

上面的迭代次数上下界是这个教学示例定义的策略。已有系统升级参数时，需要允许受支持的历史记录，并在用户成功登录后重新派生、升级记录。

**真实登录系统中，这段验证应由服务端完成。** Node.js 服务端可使用 `node:crypto` 的 `timingSafeEqual()` 比较相同长度的结果，密码哈希方案则优先使用成熟实现。

浏览器先执行 `SHA256(password)` 再发送给服务器，也不能替代 HTTPS：如果服务器把这个哈希直接当登录凭证，拿到它的人就可能直接重放登录。

结合你常用的 Vue3 + Supabase 项目：账户登录交给 Supabase Auth；Web Crypto 更适合处理额外的客户端数据加密需求。

---

**2．对称加密：使用 AES-GCM 加密文本、JSON 和密码保护的备份**

对称加密中，同一把密钥用于加密和解密。它适合处理笔记、配置、业务数据和文件内容。

这里选择 AES-GCM，因为它同时提供内容加密和完整性认证：密文或认证数据被修改时，解密会失败。GCM 常用 12 字节 IV，**同一密钥下绝不能重复使用相同 IV**。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt?utm_source=chatgpt.com)

几个参数可以这样理解：

| 参数 | 示例 | 是否保密 | 作用 |
|---|---|---|---|
| `key` | AES-256 密钥 | 是 | 决定谁能解密 |
| `iv` | 每次新生成的 12 字节随机值 | 否 | 保证每次加密使用不同的初始化值 |
| `additionalData` | `employee:123:notes:v1` | 否 | 将密文绑定到指定业务上下文 |
| `tagLength` | 128 bit | 否 | 指定认证标签长度 |
| 密文及认证标签 | `encrypt()` 返回值 | 可以存储、传输 | 加密结果 |

**案例 C：加密私人笔记或业务 JSON。**

```js
const notesKey = await wc.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  false, // 不允许 exportKey() 导出此密钥
  ["encrypt", "decrypt"]
);

async function encryptText(key, text, context = "notes:v1") {
  const iv = randomBytes(12);

  const encrypted = await wc.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: utf8(context),
      tagLength: 128
    },
    key,
    utf8(text)
  );

  return {
    v: 1,
    iv: toB64u(iv),
    data: toB64u(encrypted)
  };
}

async function decryptText(key, packet, context = "notes:v1") {
  if (packet.v !== 1) {
    throw new Error("不支持的密文版本");
  }

  const iv = fromB64u(packet.iv);

  if (iv.length !== 12) {
    throw new Error("无效的 IV");
  }

  const decrypted = await wc.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: utf8(context),
      tagLength: 128
    },
    key,
    fromB64u(packet.data)
  );

  return dec.decode(decrypted);
}

const note = {
  title: "员工备注",
  content: "这是需要保密的内容",
  updatedAt: new Date().toISOString()
};

const encryptedNote = await encryptText(
  notesKey,
  JSON.stringify(note),
  "employee:123:notes:v1"
);

// 可以把 encryptedNote 存到数据库。
console.log(encryptedNote);

const decryptedNote = JSON.parse(
  await decryptText(
    notesKey,
    encryptedNote,
    "employee:123:notes:v1"
  )
);

console.log(decryptedNote);
```

`additionalData`，通常简称 AAD，可以防止某些“把合法密文挪到错误位置”的操作。

例如，同一密钥用于多个员工的备注时，把员工 123 的密文复制到员工 456 的记录下，若解密端根据可信的目标记录构造 AAD，就会验证失败：

```js
try {
  await decryptText(
    notesKey,
    encryptedNote,
    "employee:456:notes:v1"
  );
} catch {
  console.log("解密失败：密钥、密文或业务上下文不匹配");
}
```

AAD 的业务值应根据你正在访问的目标记录确定。如果直接照搬攻击者随包提交的员工编号，就失去了这种绑定的意义。

还需要注意：

- AES-GCM 的返回值已经包含认证标签，上面的代码把它们整体保存。
- 数据库保存密文和 IV，密钥必须另外管理。
- 随机 IV 需要在每次加密时重新生成；大量加密或多设备共用同一密钥时，还需要控制使用量并制定轮换方案。
- 解密失败不一定代表密码错误，也可能是密文损坏、AAD 不匹配或密钥不对。
- `extractable: false` 禁止正常接口导出密钥，但页面中的恶意脚本仍可能调用密钥执行解密。它无法解决 XSS。

**案例 D：用用户输入的密码加密备份。**

这种需求与登录密码存储不同：用户希望以后输入同一个密码，恢复原来的数据。

处理过程是：PBKDF2 从密码派生 AES 密钥，再使用 AES-GCM 加密备份。派生所需的盐、迭代次数和 IV 随密文保存。

```js
async function deriveBackupKey(password, salt, iterations) {
  const material = await wc.subtle.importKey(
    "raw",
    utf8(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return wc.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptBackup(password, value) {
  const salt = randomBytes(16);
  const iterations = 600_000;

  const key = await deriveBackupKey(password, salt, iterations);
  const encrypted = await encryptText(
    key,
    JSON.stringify(value),
    "backup:v1"
  );

  return {
    ...encrypted,
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: toB64u(salt)
  };
}

async function decryptBackup(password, packet) {
  // 密文包属于不可信输入，先限制参数，避免超大计算成本。
  if (
    packet.v !== 1 ||
    packet.kdf !== "PBKDF2-SHA256" ||
    !Number.isInteger(packet.iterations) ||
    packet.iterations < 600_000 ||
    packet.iterations > 2_000_000
  ) {
    throw new Error("不支持的备份参数");
  }

  const salt = fromB64u(packet.salt);
  if (salt.length !== 16) {
    throw new Error("无效的盐");
  }

  const key = await deriveBackupKey(
    password,
    salt,
    packet.iterations
  );

  const plaintext = await decryptText(key, packet, "backup:v1");
  return JSON.parse(plaintext);
}

const backupPacket = await encryptBackup(
  "a-long-backup-passphrase",
  {
    tasks: [
      { id: 1, title: "检查考勤数据", done: false }
    ],
    settings: { theme: "dark" }
  }
);

const backupJSON = JSON.stringify(backupPacket);

const restored = await decryptBackup(
  "a-long-backup-passphrase",
  JSON.parse(backupJSON)
);

console.log(restored);
```

这适合离线笔记、个人配置备份和密码保护的导出文件。忘记密码后，如果没有另设恢复机制，就无法正常恢复数据；密码过弱时，拿到密文的人仍可以离线猜测。

如果还想支持“修改密码但不重新加密所有文件”，可以进一步使用两层密钥：随机数据密钥负责加密文件，密码派生密钥只负责加密数据密钥。

---

**3．非对称加密与数字签名：RSA、ECDSA 的职责**

非对称算法使用公钥、私钥，但不同算法解决不同问题：

| Web Crypto 算法名 | 用途 | 关键操作 |
|---|---|---|
| `RSA-OAEP` | 非对称加密 | 公钥加密，私钥解密 |
| `RSA-PSS` | 数字签名 | 私钥签名，公钥验签 |
| `RSASSA-PKCS1-v1_5` | 数字签名，常用于兼容现有协议 | 私钥签名，公钥验签 |
| `ECDSA` | 椭圆曲线数字签名 | 私钥签名，公钥验签 |
| `ECDH` | 密钥协商 | 双方派生共享秘密，再用于后续加密 |

**不要把签名理解成“用私钥加密”。** 签名用于验证真实性和完整性，消息本身通常仍是公开的。Web Crypto 也会通过密钥算法和用途限制，区分 RSA 加密密钥与 RSA 签名密钥。

**案例 E：RSA-OAEP 加密短消息。**

```js
const rsaKeys = await wc.subtle.generateKey(
  {
    name: "RSA-OAEP",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), // 65537
    hash: "SHA-256"
  },
  false,
  ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
);

const rsaCiphertext = await wc.subtle.encrypt(
  { name: "RSA-OAEP" },
  rsaKeys.publicKey,
  utf8("一段较短的秘密")
);

const rsaPlaintext = await wc.subtle.decrypt(
  { name: "RSA-OAEP" },
  rsaKeys.privateKey,
  rsaCiphertext
);

console.log(dec.decode(rsaPlaintext));
```

RSA-OAEP 不能直接加密任意长度的数据。采用 2048 位 RSA 和 SHA-256 时，单次明文上限是：

```text
256 - 2 × 32 - 2 = 190 字节
```

这里限制的是字节数，中文字符串的字符数不能直接等同于字节数。因此，文件和大型 JSON 应使用下面的混合加密方式。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt?utm_source=chatgpt.com)

**案例 F：RSA + AES 混合加密，实现保密文件交换。**

实际做法是：每份数据随机生成一把 AES 密钥，AES 加密内容，再使用接收者的 RSA 公钥加密这把 AES 密钥。

```js
async function hybridEncrypt(publicKey, text) {
  const dataKey = await wc.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // wrapKey() 需要先导出这把临时数据密钥
    ["encrypt", "decrypt"]
  );

  const encryptedContent = await encryptText(
    dataKey,
    text,
    "hybrid:v1"
  );

  const wrappedKey = await wc.subtle.wrapKey(
    "raw",
    dataKey,
    publicKey,
    { name: "RSA-OAEP" }
  );

  return {
    ...encryptedContent,
    wrappedKey: toB64u(wrappedKey)
  };
}

async function hybridDecrypt(privateKey, packet) {
  const dataKey = await wc.subtle.unwrapKey(
    "raw",
    fromB64u(packet.wrappedKey),
    privateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  return decryptText(dataKey, packet, "hybrid:v1");
}

const hybridPacket = await hybridEncrypt(
  rsaKeys.publicKey,
  JSON.stringify({
    document: "这里可以换成比 RSA 单次上限大得多的数据",
    rows: Array.from({ length: 100 }, (_, i) => ({ id: i }))
  })
);

const openedDocument = JSON.parse(
  await hybridDecrypt(rsaKeys.privateKey, hybridPacket)
);

console.log(openedDocument);
```

这个示例演示的是混合加密的核心机制，并不是完整的 JWE 文件格式。正式跨系统协议还应定义算法标识、版本、密钥编号和数据大小限制。

另外，**加密给某个公钥，并不能证明发送者是谁**。任何拿到该公钥的人都可以生成新的加密包；如果要验证发送者，还需要签名。

接收者公钥也必须来自可信渠道，否则攻击者可能把它替换成自己的公钥。

**案例 G：ECDSA 签署审批结果或导出清单。**

例如，服务器生成一份审批结果，希望其他系统能够验证其确实来自服务器，且金额、单号没有被改动。

```js
const signingKeys = await wc.subtle.generateKey(
  {
    name: "ECDSA",
    namedCurve: "P-256"
  },
  false,
  ["sign", "verify"]
);

const approval = {
  approvalId: "AP-20261110-001",
  employeeId: "EMP-123",
  amount: 1200,
  status: "approved"
};

// 签名针对的是这段确定的字节，而非抽象的 JS 对象。
const approvalText = JSON.stringify(approval);

const approvalSignature = await wc.subtle.sign(
  {
    name: "ECDSA",
    hash: "SHA-256"
  },
  signingKeys.privateKey,
  utf8(approvalText)
);

const signedApproval = {
  payload: approvalText,
  signature: toB64u(approvalSignature)
};

async function verifyApproval(packet, publicKey) {
  return wc.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    fromB64u(packet.signature),
    utf8(packet.payload)
  );
}

console.log(
  await verifyApproval(signedApproval, signingKeys.publicKey)
); // true

const changedApproval = {
  ...signedApproval,
  payload: signedApproval.payload.replace(
    '"amount":1200',
    '"amount":999999'
  )
};

console.log(
  await verifyApproval(changedApproval, signingKeys.publicKey)
); // false
```

这里直接传输被签署的 `payload` 字符串，接收者对原始字符串验签，再解析 JSON。若接收方先解析对象、调整属性顺序后重新序列化，即使业务含义相同，也可能因为字节变化而验签失败。需要跨语言重新序列化时，应约定规范化格式。

Web Crypto 的 ECDSA 签名使用固定长度的 `r || s` 格式；P-256 通常为 64 字节。一些其他库使用 ASN.1 DER 格式，互通时要明确格式差异。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign?utm_source=chatgpt.com)

公钥可以导出为 JWK，交给验证方：

```js
const publicJwk = await wc.subtle.exportKey(
  "jwk",
  signingKeys.publicKey
);

// 接收方导入公钥。
const importedPublicKey = await wc.subtle.importKey(
  "jwk",
  publicJwk,
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["verify"]
);

console.log(
  await verifyApproval(signedApproval, importedPublicKey)
); // true
```

`generateKey(..., false, ...)` 对这类密钥对生成操作会使私钥不可导出，公钥仍可导出。公钥无需保密，但验证方必须确认它对应可信的签发者。

如果系统要求 RSA 签名，可以使用单独的 RSA-PSS 密钥对：

```js
const rsaSigningKeys = await wc.subtle.generateKey(
  {
    name: "RSA-PSS",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256"
  },
  false,
  ["sign", "verify"]
);

const rsaSignature = await wc.subtle.sign(
  { name: "RSA-PSS", saltLength: 32 },
  rsaSigningKeys.privateKey,
  utf8(approvalText)
);

console.log(
  await wc.subtle.verify(
    { name: "RSA-PSS", saltLength: 32 },
    rsaSigningKeys.publicKey,
    rsaSignature,
    utf8(approvalText)
  )
); // true
```

---

**4．安全随机数：token、验证码、UUID**

`Math.random()` 不适合生成登录凭证、重置密码链接、密钥或安全验证码。Web Crypto 提供的 `getRandomValues()` 用于生成密码学安全的随机值，每次调用可填充的数组大小最多为 65,536 字节。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues?utm_source=chatgpt.com)

**案例 H：生成重置密码 token 或随机访问凭证。**

```js
function createToken() {
  // 32 字节 = 256 bit 随机值
  return toB64u(randomBytes(32));
}

const resetToken = createToken();

console.log(resetToken);
console.log(resetToken.length); // 43 个 Base64URL 字符
```

正式的重置密码流程通常应由服务端生成 token，给用户发送原始值，数据库只保存摘要及状态：

```js
// 服务端逻辑示意，避免把 token 写入生产日志。
const rawToken = createToken();
const tokenHash = await sha256Hex(utf8(rawToken));

const resetRecord = {
  userId: "user-123",
  tokenHash,
  expiresAt: Date.now() + 15 * 60 * 1000,
  usedAt: null
};

// 数据库保存 resetRecord。
// 发给用户的链接中携带 rawToken。
```

用户提交 token 时，服务器计算其摘要，查找记录，检查有效期，并在使用成功时原子地标记为已消费。

这里直接使用 SHA-256 是合理的：原始 token 是高熵随机值，攻击者无法像猜常见密码一样有效枚举。它与人类选择的低熵密码不同。

**案例 I：均匀生成六位数字验证码。**

不要简单地对一个随机字节取 `% 10`。因为 256 不能被 10 整除，会让部分数字出现概率略高。

下面使用“拒绝采样”，丢弃不能均匀分组的尾部值：

```js
// 返回 [0, max) 范围内的均匀随机整数。
function randomInt(max) {
  if (
    !Number.isSafeInteger(max) ||
    max < 1 ||
    max > 2 ** 32
  ) {
    throw new Error("max 必须是 1 到 2^32 之间的整数");
  }

  const range = 2 ** 32;
  const limit = Math.floor(range / max) * max;

  let value;
  do {
    value = wc.getRandomValues(new Uint32Array(1))[0];
  } while (value >= limit);

  return value % max;
}

function createVerificationCode() {
  return String(randomInt(1_000_000)).padStart(6, "0");
}

console.log(createVerificationCode());
// 可能是 "038251"，因此不要转换为数字保存。
```

验证码只有一百万种组合，随机数安全不等于整个验证流程安全。真正用于短信或邮件登录时，必须在服务端生成和验证，并设置有效期、错误次数上限、发送频率和一次性消费机制。

验证码的数据库保护也与高熵 token 不同：**六位数字直接做 SHA-256，数据库泄露后仍很容易枚举**。可以使用服务器独立保管的 HMAC 密钥保护验证码记录，同时限制在线尝试次数。

**案例 J：生成 UUID。**

```js
const recordId = wc.randomUUID();
console.log(recordId);
// 例如：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
```

UUID 很适合记录编号和请求追踪编号。对于承载授权能力的秘密链接或访问凭证，单独使用前面的随机 token 方案更便于明确其随机长度和用途。

---

**5．签名与验证：HMAC，以及 JWT 的签名部分**

先区分 HMAC 和数字签名：

| 对比 | HMAC | ECDSA / RSA 数字签名 |
|---|---|---|
| 生成方使用什么 | 共享秘密密钥 | 私钥 |
| 验证方使用什么 | 同一个秘密密钥 | 公钥 |
| 验证方能否自行生成合法结果 | 能 | 仅持公钥时不能 |
| 常见用途 | 共享密钥服务间认证、HS256 JWT | 多服务验签、公开验证、ES256/RS256 JWT |

Web Crypto 统一通过 `sign()`、`verify()` 操作 HMAC，但从密码学分类上，HMAC 属于消息认证码。

**案例 K：对消息生成 HMAC 并验证。**

```js
const hmacKey = await wc.subtle.generateKey(
  {
    name: "HMAC",
    hash: "SHA-256",
    length: 256
  },
  false,
  ["sign", "verify"]
);

const message = JSON.stringify({
  orderId: "ORDER-1001",
  amount: 19900,
  currency: "CNY"
});

const messageMac = await wc.subtle.sign(
  "HMAC",
  hmacKey,
  utf8(message)
);

console.log(
  await wc.subtle.verify(
    "HMAC",
    hmacKey,
    messageMac,
    utf8(message)
  )
); // true

console.log(
  await wc.subtle.verify(
    "HMAC",
    hmacKey,
    messageMac,
    utf8(message.replace("19900", "1"))
  )
); // false
```

用于 Webhook 时，实际应按双方约定，对原始请求体或明确拼接的字节签名，同时纳入时间戳、事件编号等信息。接收端还要限制时间窗口、记录已处理事件，防止攻击者重放一份合法消息。

不要在接收端解析 JSON 后随意重新序列化再验签，否则空格或字段顺序变化就可能改变签名字节。

**案例 L：手动实现 HS256 JWT，理解其签名原理。**

常见的签名 JWT 使用三段式 JWS 紧凑格式：

```text
Base64URL(header).Base64URL(payload).Base64URL(signature)
```

HS256 的计算方式是：

```text
签名输入 = 编码后的 header + "." + 编码后的 payload
signature = HMAC-SHA256(秘密密钥, 签名输入)
```

HS256 应使用至少 256 bit 的高熵密钥；ES256 对应 P-256 + SHA-256，RS256 对应 RSASSA-PKCS1-v1_5 + SHA-256，PS256 对应 RSA-PSS + SHA-256。JWT 算法名与 Web Crypto 参数不是同一套字符串，需要正确映射。[rfc-editor.org](https://www.rfc-editor.org/info/rfc7518/?utm_source=chatgpt.com)

下面的代码是一个**固定只支持 HS256、普通 JWT 头的教学实现**，不是通用 JOSE 库。

先生成 JWT：

```js
function jsonPart(value) {
  return toB64u(utf8(JSON.stringify(value)));
}

async function signJwtHS256(payload, key) {
  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  const signingInput =
    `${jsonPart(header)}.${jsonPart(payload)}`;

  const signature = await wc.subtle.sign(
    "HMAC",
    key,
    utf8(signingInput)
  );

  return `${signingInput}.${toB64u(signature)}`;
}

const jwtKey = await wc.subtle.generateKey(
  {
    name: "HMAC",
    hash: "SHA-256",
    length: 256
  },
  false,
  ["sign", "verify"]
);

const now = Math.floor(Date.now() / 1000);

const jwt = await signJwtHS256(
  {
    sub: "user-123",
    iss: "https://auth.example.com",
    aud: "attendance-api",
    iat: now,
    exp: now + 15 * 60,
    role: "staff"
  },
  jwtKey
);

console.log(jwt);
```

JWT 时间字段使用 Unix 秒，而 `Date.now()` 返回毫秒，因此这里必须除以 1000。

再验证：

```js
async function verifyJwtHS256(
  token,
  key,
  {
    issuer,
    audience,
    now = Math.floor(Date.now() / 1000)
  }
) {
  if (typeof token !== "string" || token.length > 8192) {
    throw new Error("无效的 token");
  }

  const parts = token.split(".");

  if (parts.length !== 3 || parts.some(part => !part)) {
    throw new Error("JWT 必须包含三个非空部分");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const header = JSON.parse(
    dec.decode(fromB64u(encodedHeader))
  );

  // 固定算法白名单，不让输入决定可使用的密码学算法。
  // 本示例同时拒绝 crit、b64 等未实现的扩展头。
  if (
    !header ||
    header.alg !== "HS256" ||
    header.typ !== "JWT" ||
    Object.keys(header).some(
      key => !["alg", "typ"].includes(key)
    )
  ) {
    throw new Error("不支持的 JWT header");
  }

  const signature = fromB64u(encodedSignature);

  const validSignature =
    signature.length === 32 &&
    await wc.subtle.verify(
      "HMAC",
      key,
      signature,
      utf8(`${encodedHeader}.${encodedPayload}`)
    );

  if (!validSignature) {
    throw new Error("JWT 签名无效");
  }

  // 验签成功后，再读取和检查业务声明。
  const claims = JSON.parse(
    dec.decode(fromB64u(encodedPayload))
  );

  if (
    !claims ||
    typeof claims !== "object" ||
    Array.isArray(claims)
  ) {
    throw new Error("无效的 JWT payload");
  }

  // 本应用要求必须携带 exp。
  if (!Number.isFinite(claims.exp) || now >= claims.exp) {
    throw new Error("JWT 已过期或缺少有效的 exp");
  }

  if (
    claims.nbf !== undefined &&
    (!Number.isFinite(claims.nbf) || now < claims.nbf)
  ) {
    throw new Error("JWT 尚未生效");
  }

  if (claims.iss !== issuer) {
    throw new Error("签发方不匹配");
  }

  const aud = claims.aud;

  const validAudience =
    aud === audience ||
    (
      Array.isArray(aud) &&
      aud.every(value => typeof value === "string") &&
      aud.includes(audience)
    );

  if (!validAudience) {
    throw new Error("接收方不匹配");
  }

  if (typeof claims.sub !== "string" || !claims.sub) {
    throw new Error("缺少有效的用户标识");
  }

  return claims;
}

const verifiedClaims = await verifyJwtHS256(
  jwt,
  jwtKey,
  {
    issuer: "https://auth.example.com",
    audience: "attendance-api"
  }
);

console.log(verifiedClaims.sub);  // user-123
console.log(verifiedClaims.role); // staff
```

这段代码有几个值得理解的设计：

- **算法固定为 HS256。** 不能只读取用户提交的 `alg`，然后无条件使用该算法。
- **验证原始两段编码组成的字节。** 不解析后重组 header、payload 再验签。
- **验证签名之后，还检查声明。** 合法签名不能证明 token 尚未过期，也不能证明它是发给当前 API 的。
- **`exp` 在这个应用策略中是必填项。** JWT 规范中的可选字段，可以由业务场景进一步要求。
- **拒绝未实现的扩展头。** 完整协议实现还涉及更多边界条件，生产系统应使用成熟 JWT/JOSE 库。

固定可接受算法、验证签发方和接收方等要求，都是 JWT 安全最佳实践中的关键部分。[rfc-editor.org](https://www.rfc-editor.org/info/rfc8725/?utm_source=chatgpt.com)

**JWT 的几个实际限制也很重要。**

第一，普通签名 JWT 的 header 和 payload 可以直接解码。`role`、用户编号等字段没有被加密，不应该放密码、完整身份证号等秘密内容。需要内容保密时，应另行设计加密机制或使用符合要求的 JWE。

第二，HS256 的验签方持有同一把秘密密钥，因此也能签发 token。**不能把正式系统的 HS256 密钥放进 Vue 前端、环境变量打包结果或浏览器脚本中。** 上面的浏览器运行方式仅用于理解算法；真实签发与权威验证应放在可信服务端。

第三，使用 ES256、RS256 等公钥算法时，前端可以拿公钥验签，但这不能替代 API 的鉴权。攻击者可以修改自己的前端代码，服务器必须独立验证请求权限。

第四，JWT 验签通过，也不代表用户没有被禁用、权限没有变化或 token 没被撤销。这些属于会话和授权策略，需要结合短有效期、服务端状态或其他机制处理。

---

**把这些能力放回业务系统，可以按下面的边界使用。**

| 你的业务需求 | 合适的处理方式 | 主要执行位置 |
|---|---|---|
| Vue + Supabase 账户登录 | 使用 Supabase Auth 管理密码和会话 | 认证服务 |
| 检查 CSV 是否重复导入 | SHA-256 文件摘要，服务端复核去重规则 | 浏览器可预计算 |
| 密码保护的个人备份 | PBKDF2 派生密钥 + AES-GCM | 浏览器 |
| 数据库敏感字段加密 | AES-GCM + 独立密钥管理 | 通常在服务端 |
| 只让接收者解密的数据包 | AES-GCM + RSA-OAEP 混合加密 | 按协议分工 |
| 公开验证的审批结果 | ECDSA 或 RSA 签名，可信公钥验签 | 可信签发端 |
| 重置密码链接 | 高熵随机 token + 摘要存储 + 一次性消费 | 服务端 |
| 短信或邮件验证码 | 安全随机数 + 过期、限流、尝试次数限制 | 服务端 |
| 服务间 Webhook | HMAC + 时间戳和防重放机制 | 服务端 |
| JWT 登录凭证 | 成熟 JOSE 实现 + 完整声明和权限检查 | 可信认证端与 API |

密钥管理决定了这些算法能否真正保护数据：把 AES 密钥和密文一起保存到同一个可读位置，或者把 JWT 签名密钥打包进前端，都会破坏预期的安全边界。浏览器也不会替你完成密钥备份、跨设备同步、轮换或恢复设计。

本轮在 Node.js 24.22.1 的 Web Crypto 实现中验证了核心操作，包括 PBKDF2 正确/错误密码、AES-GCM 篡改与 AAD 不匹配、RSA-OAEP 密钥封装、ECDSA 验签，以及 JWT 篡改、过期、错误接收方和 `alg: none` 的拒绝路径。浏览器端仍需结合目标浏览器做集成验证。

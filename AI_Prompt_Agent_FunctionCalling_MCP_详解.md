# AI Prompt、Agent、Tools、Function Calling 与 MCP 完整详解

> **版本：** 2026-10-30  
> **用途：** 概念学习、技术选型、AI 应用架构设计参考  
> **核心结论：** Prompt 负责提供指令和上下文；LLM 负责理解与生成；Agent 运行时负责组织多步任务；Function Calling 是模型提出工具调用请求的机制；Tools 是可执行能力；MCP 是 AI 应用与外部服务之间的标准化连接协议。

---

## 目录

1. 先建立整体认识：这几个概念分别处于什么层级
2. Prompt：System Prompt、Developer Prompt、User Prompt
3. LLM 与 AI Agent：从“回答问题”到“完成任务”
4. Agent 的典型架构与运行循环
5. Agent Tools：AI 可以使用的外部能力
6. Function Calling：模型如何提出工具调用请求
7. MCP：Model Context Protocol 到底解决什么问题
8. MCP 的 Host、Client、Server 架构
9. MCP 的三类核心能力：Tools、Resources、Prompts
10. Function Calling、Tools、API、MCP 的区别与关系
11. 把所有概念串起来：一个完整的任务执行案例
12. 典型误区与纠正
13. 实际开发中应该怎样选择技术方案
14. 安全、权限与工程实践
15. 最后用一张表记住所有概念
16. 官方资料与延伸阅读

---

# 1. 先建立整体认识：这几个概念分别处于什么层级

这些名词经常被放在一起讨论，但它们其实不是同一层级的东西。

可以先记住下面这张表：

| 概念 | 它主要回答的问题 | 核心职责 |
|---|---|---|
| System Prompt | AI 应该遵循什么规则？ | 定义高优先级行为规范、身份和边界 |
| Developer Prompt | 这个 AI 应用应该怎样工作？ | 定义应用逻辑、工具使用方式、输出约定 |
| User Prompt | 用户现在想完成什么？ | 提供具体任务、问题、要求和输入资料 |
| LLM | 如何理解输入并生成下一步输出？ | 语言理解、推理、生成、选择下一步动作 |
| AI Agent | 怎样把一个目标真正完成？ | 组织任务、决定步骤、调用能力、观察结果并继续执行 |
| Function Calling | 模型怎样表达“我要调用某个工具”？ | 将模型的调用意图结构化输出给应用程序 |
| Agent Tools | AI 实际能使用哪些能力？ | 查询数据、读写文件、调用 API、运行代码等 |
| MCP | 不同 AI 应用怎样用统一方式连接外部能力？ | 标准化发现、调用工具和交换上下文的协议 |

## 1.1 更准确的整体架构图

```text
                         人类用户
                            │
                            ▼
                    User Prompt / 用户输入
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│                    AI 应用 / Agent Runtime                │
│                                                          │
│  System Prompt / Developer Instructions                  │
│  ├─ 身份、规则、目标、约束、权限边界                       │
│  └─ 可用工具说明、输出格式、业务流程                       │
│                                                          │
│  对话上下文 / Memory / 检索到的资料                        │
│                            │                             │
│                            ▼                             │
│                         LLM                               │
│                  理解、判断、生成下一步                    │
│                            │                             │
│               ┌────────────┴────────────┐                 │
│               │                         │                 │
│          输出普通文本               输出工具调用请求       │
│               │                         │                 │
│               │                         ▼                 │
│               │                 Function Calling          │
│               │              （结构化调用意图）             │
│               │                         │                 │
│               │                         ▼                 │
│               │                  Agent Runtime            │
│               │              权限检查、参数校验、调度       │
│               │                         │                 │
│               │              ┌──────────┴──────────┐       │
│               │              │                     │       │
│               │          本地/内置 Tools       MCP Client    │
│               │              │                     │       │
│               │              ▼                     ▼       │
│               │        函数/API/文件/代码       MCP Server    │
│               │                                    │       │
│               │                             外部 API/数据库  │
│               │                             文件/业务系统    │
│               │                                    │       │
│               │              └──────────┬──────────┘       │
│               │                         │                 │
│               │                    工具执行结果            │
│               │                         │                 │
│               └───────────────返回给 LLM ◄┘                 │
│                            │                             │
│                 判断是否还需要下一步                        │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
                       最终回答 / 任务结果
```

注意：这张图是帮助理解的**一种常见架构**，不是强制标准。实际产品可能把 Agent Runtime、工具调度、MCP Client 等封装在同一个服务或 SDK 中，也可能使用确定性代码来控制一部分流程。

## 1.2 最容易记住的层级关系

可以把它们分成四层：

1. **指令层：** System Prompt、Developer Prompt、User Prompt，告诉模型应该怎样做、当前要做什么。
2. **智能层：** LLM 负责理解任务、判断信息、生成文本或提出下一步动作。
3. **执行层：** Agent Runtime 负责管理任务流程；Function Calling 负责表达工具调用意图；Tools 负责真正执行。
4. **连接协议层：** MCP 为 AI 应用连接外部工具和上下文提供标准化方式。

因此，不要把 MCP 理解成 Agent 的“最后一个子模块”，也不要理解成 Function Calling 的简单升级版。它们解决的是不同问题。

---

# 2. Prompt：System Prompt、Developer Prompt、User Prompt

Prompt 通常翻译为“提示词”或“提示”。在实际 AI 应用中，Prompt 不一定是一段简单文字，它可以由多条不同角色的消息、对话历史、图片、文件、结构化数据和工具说明共同组成。

## 2.1 System Prompt：系统提示词

**System Prompt 的核心作用：定义 AI 应该遵循的高优先级行为规则。**

它通常会描述：

- AI 的身份和职责：你是谁，要扮演什么角色。
- 行为原则：怎样回答、怎样分析、怎样处理不确定信息。
- 安全边界：哪些操作不允许，哪些内容需要谨慎处理。
- 长期约束：语言风格、格式要求、隐私要求、拒绝规则等。

例如：

```text
你是一名专业的软件开发助手。
回答技术问题时，优先给出可运行、可验证的方案。
如果不确定某个 API 是否仍然有效，应先核实官方文档。
不要编造测试结果，不要声称执行了实际上没有执行的操作。
涉及删除数据、发送邮件或修改生产环境时，必须先进行权限检查和确认。
```

可以把 System Prompt 理解成：**AI 的基本行为规范和工作边界。**

### System Prompt 是不是“隐藏指令”？

很多聊天产品不会把系统级指令直接展示给用户，因此从使用者角度看，它常常像一份“看不见的说明书”。但“隐藏”不是 System Prompt 的技术定义：在 API 开发中，应用开发者会明确提供系统或开发者指令；在不同平台中，这类指令的角色名称和可见性也可能不同。

还要注意：System Prompt 不是可靠安全机制的全部。不能只靠一句“禁止删除数据”就认为数据库安全了。真正的权限控制必须由后端、工具执行层和业务系统落实。

## 2.2 Developer Prompt：开发者提示词

这是原始概念列表中值得补充的一项。

Developer Prompt 通常由 AI 应用的开发者提供，用来描述这个具体应用的工作方式。它不像面向所有场景的通用行为规范，而是更偏向应用逻辑和业务要求。

例如，一个企业 CRM 助手的 Developer Prompt 可以规定：

```text
你是公司内部 CRM 助手。
你可以查询客户、创建跟进记录、更新客户状态。
查询客户时优先使用 customer_search 工具。
更新客户资料前必须确认客户 ID 和待修改字段。
不得向没有权限的用户展示客户的敏感字段。
输出客户列表时使用统一表格格式。
```

它通常描述：

- 当前应用的业务目标；
- 允许使用的工具及调用规则；
- 业务流程和判断条件；
- 数据权限和输出格式；
- 遇到异常时应该怎样处理。

在 OpenAI 的 API 文档中，`developer` 消息优先级高于 `user` 消息；不同产品的具体角色设计可能不同，但关键思想是：**应用开发者设定的规则不能被普通用户的一句话随意覆盖。**

## 2.3 User Prompt：用户提示词

User Prompt 就是用户当前交给 AI 的输入。

例如：

```text
请帮我分析这份 Excel 文件中的销售数据，
找出销售额下降最多的 5 个产品，
并生成一份 Markdown 分析报告。
```

User Prompt 可以包含：

- 任务目标：分析数据、生成文档、写代码、查资料；
- 具体要求：格式、语言、字数、范围；
- 约束条件：预算、时间、技术栈、不能做什么；
- 输入资料：文字、图片、PDF、Excel、代码、链接等。

User Prompt 不一定只有一条消息。多轮对话中的历史消息，也可能成为模型当前任务的上下文。

## 2.4 三者放在一起看

| 类型 | 谁提供 | 关注点 | 例子 |
|---|---|---|---|
| System Prompt | 平台或系统设计者 | 基础行为规范与边界 | 不编造事实，遵守安全要求 |
| Developer Prompt | 应用开发者 | 当前应用的业务规则 | CRM 助手只能通过授权工具修改客户 |
| User Prompt | 最终用户 | 具体任务和需求 | 查询客户 A 的订单并生成报告 |

可以用编程来类比：

```text
Developer Prompt ≈ 函数定义、业务规则
User Prompt      ≈ 函数参数、当前输入
LLM              ≈ 根据规则处理输入的执行引擎
```

这个类比不是严格的编程语言等价关系，但有助于理解两类消息的分工。

## 2.5 Prompt、Context、Memory 有什么区别？

这几个概念也经常混在一起：

- **Prompt：** 传给模型的指令和输入内容。
- **Context（上下文）：** 模型在当前生成过程中能够使用的信息，通常包括 Prompt、对话历史、工具说明、检索资料等。
- **Memory（记忆）：** 系统跨轮次或跨任务保留的信息，以便后续继续使用。它可以是用户偏好、任务状态、历史事实或外部数据库中的记录。
- **RAG（检索增强生成）：** 在回答前从外部知识库或文件中检索相关内容，再把检索结果提供给模型作为上下文。

Memory 不等于 Context，RAG 也不等于 Memory。检索到的资料可能只在当前任务中使用，并不一定会被长期保存。

---

# 3. LLM 与 AI Agent：从“回答问题”到“完成任务”

## 3.1 什么是 LLM？

LLM 是 Large Language Model，即大型语言模型。

它的核心能力是根据输入的上下文，理解内容并生成后续输出。它可以回答问题、总结文档、翻译文字、解释代码、生成 SQL，也可以根据工具定义输出结构化的工具调用请求。

但要区分：**一个模型能够描述“应该怎样做”，不代表它已经真的执行了这些操作。**

例如：

用户说：“帮我把客户 A 的状态改为已签约。”

普通 LLM 可能只会回答：

```text
你可以进入 CRM 客户详情页，将状态字段修改为“已签约”。
```

它给出了建议，但并没有真正修改 CRM。

如果要让 AI 实际完成修改，还需要工具、权限、执行环境和流程控制。

## 3.2 什么是 AI Agent？

AI Agent 通常翻译为“AI 智能体”或“AI 代理”。

可以把它理解为：**一个能够围绕目标，利用模型做决策，并通过工具与外部环境交互，逐步完成任务的 AI 系统。**

Agent 不只是“问一句、答一句”，它可以：

1. 理解用户目标；
2. 判断目标还缺少哪些信息；
3. 将任务拆成若干步骤；
4. 选择合适的工具；
5. 调用工具获取数据或执行操作；
6. 检查执行结果；
7. 根据结果调整下一步；
8. 判断任务是否完成，最后汇报结果。

例如，用户提出：

```text
帮我检查项目中的 Supabase 数据库结构，
梳理所有业务表和数据库函数，
然后生成一份 API 设计文档。
```

一个具备工具能力的 Agent 可以：

- 读取项目文件；
- 连接数据库或使用数据库查询工具；
- 获取表结构、字段和函数定义；
- 分析前后端代码中的调用关系；
- 整理 API 清单和数据结构；
- 生成 Markdown 文档；
- 检查文档是否遗漏关键模块。

这就不只是回答“如何生成 API 文档”，而是围绕目标完成一组实际工作。

## 3.3 Agent 的常见组成

经常会看到这样的简化公式：

```text
AI Agent = LLM + 目标 + 记忆 + 规划 + 工具 + 执行循环
```

这个公式适合入门理解，但不是所有 Agent 都必须具备的固定定义。更准确地说：

| 组成部分 | 作用 | 是否必需 |
|---|---|---|
| LLM | 理解任务、判断、生成下一步 | 在典型 LLM Agent 中是核心 |
| 目标 / Instructions | 明确任务要达到什么状态 | 必需，但目标可以来自用户或应用 |
| Tools | 读取信息或对外部系统采取行动 | 典型工具型 Agent 的核心能力；简单 Agent 未必需要外部工具 |
| Planning | 将复杂任务分解，决定步骤 | 常见，但不一定显式展示计划 |
| Memory / State | 保存历史信息、阶段结果和任务状态 | 可选，简单任务可以不需要长期记忆 |
| Orchestrator / Runtime | 控制模型调用、工具执行、循环、停止条件 | 真实应用通常需要某种运行时或流程控制 |
| Guardrails | 限制权限、检查输入输出、拦截危险操作 | 生产环境非常重要 |

因此，不能把“有记忆”当作 Agent 的必要条件，也不能认为只要让模型输出一份计划，它就已经成为 Agent。

## 3.4 普通 LLM 与 AI Agent 的区别

| 对比 | 普通 LLM 调用 | AI Agent |
|---|---|---|
| 主要目标 | 生成一次回答 | 完成一个任务或目标 |
| 执行方式 | 通常一次输入、一次输出 | 可能多轮调用模型和工具 |
| 任务拆解 | 可能给出建议 | 可以根据情况决定下一步 |
| 工具使用 | 可以没有工具，也可以单次调用工具 | 通常会动态选择和组合工具 |
| 环境反馈 | 通常不持续观察外部环境 | 会读取工具结果，再调整行动 |
| 状态管理 | 通常只关注当前请求和提供的上下文 | 可能维护任务状态、历史结果和检查点 |
| 自主程度 | 较低 | 可从有限自主到高度自主 |

通俗比喻：

```text
普通 LLM：像一位知识丰富的顾问。你问一个问题，它给出答案。
AI Agent：像一位能够使用公司系统的助理。你交代目标，它会查资料、操作系统、检查结果，再向你汇报。
```

注意，这只是比喻。Agent 并不一定比普通 LLM“更聪明”，它的主要区别在于是否被赋予了任务控制、工具执行和反馈循环。

## 3.5 Workflow 与 Agent 的区别

这是一个非常重要、但经常被忽略的区别。

**Workflow（工作流）：** 步骤通常由开发者预先写好，系统按固定路径执行。

例如：

```text
收到订单
  ↓
检查库存
  ↓
扣减库存
  ↓
生成发货单
  ↓
发送通知
```

每一步基本是预先确定的，LLM 可以负责其中的文本理解或分类，但不一定负责决定整个流程。

**Agent：** 模型可以根据当前情况，动态判断该执行哪一步、是否需要换工具、是否需要补充信息。

例如：

```text
目标：处理一张客户投诉
  ↓
读取投诉内容
  ↓
判断问题类型
  ├─ 物流问题：查询物流工具
  ├─ 退款问题：查询订单和退款规则
  └─ 产品问题：检索产品知识库
  ↓
发现信息不足？── 是 → 继续查询或询问用户
  ↓ 否
提出处理建议或执行授权操作
  ↓
检查结果并汇报
```

两者并不是非此即彼。实际系统经常混合使用：固定、重要、可预测的步骤交给代码；需要理解上下文和动态选择的步骤交给 LLM/Agent。

---

# 4. Agent 的典型架构与运行循环

Agent 的关键不只是“会思考”，而是有一个能够反复执行、接收外部结果并继续决策的运行循环。

## 4.1 一次典型的 Agent Loop

```text
用户提出目标
    │
    ▼
Agent 接收任务与上下文
    │
    ▼
LLM 理解目标、判断当前状态
    │
    ▼
是否需要调用工具？
    │
 ┌──┴─────────────┐
 │                │
 不需要           需要
 │                │
 ▼                ▼
生成回答       选择工具和参数
                  │
                  ▼
             Runtime 检查权限
                  │
                  ▼
               执行工具
                  │
                  ▼
             获取工具执行结果
                  │
                  ▼
             将结果返回给 LLM
                  │
                  ▼
           任务是否已经完成？
              │          │
             是          否
              │          │
              ▼          └──── 返回 LLM 继续判断
           汇总结果
              │
              ▼
            结束
```

## 4.2 Agent 的“自主”到底体现在哪里？

主要体现在模型或 Agent 控制逻辑能够根据当前状态动态选择下一步，而不是始终机械执行固定步骤。

比如：

- 第一次查询数据库失败，Agent 可以根据报错修正查询参数；
- 查到的信息不完整，可以决定再查另一张表；
- 发现用户没有提供项目路径，可以向用户询问；
- 已经达到目标，可以停止，不再继续调用工具；
- 某个操作具有风险，可以暂停并要求人工确认。

但 Agent 的自主性始终应该处于权限和运行规则的约束之下。**自主执行不等于拥有无限权限。**

## 4.3 Agent 并不一定只有一个

复杂应用可以采用多 Agent 架构，例如：

```text
                  主 Agent / 调度 Agent
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
       研究 Agent      编码 Agent      测试 Agent
          │              │              │
       搜索资料        修改代码        执行测试
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                    主 Agent 汇总
                         │
                         ▼
                      最终交付
```

常见的多 Agent 协作模式包括：

- **Manager 模式：** 主 Agent 始终掌握任务，由它把子任务交给专业 Agent，最后汇总结果。
- **Handoff 模式：** 主 Agent 将任务控制权移交给另一个 Agent，由后者负责后续处理。
- **顺序工作流：** 一个 Agent 完成后，将输出交给下一个 Agent。

多 Agent 不一定更好。Agent 数量越多，协调、权限、成本、延迟、错误定位和结果一致性问题也会越复杂。能用一个 Agent 清楚完成的任务，不必为了“高级”而拆成多个。

---

# 5. Agent Tools：AI 可以使用的外部能力

## 5.1 什么是 Agent Tools？

Agent Tools（Agent 工具）是 AI 应用提供给模型或 Agent 使用的具体能力。

例如：

| 工具类别 | 具体能力 | 示例 |
|---|---|---|
| 搜索类 | 搜索互联网或内部知识库 | `web_search`、`search_docs` |
| 数据查询类 | 查询数据库或业务系统 | `query_customer`、`get_order` |
| 文件类 | 读取、创建、修改文件 | `read_file`、`write_file` |
| 代码执行类 | 运行脚本、执行测试 | `run_python`、`run_tests` |
| API 类 | 调用外部 HTTP API | `get_weather`、`create_ticket` |
| 操作类 | 修改数据或执行业务动作 | `update_customer`、`send_email` |
| 浏览器 / 电脑操作类 | 点击网页、输入内容、操作界面 | browser automation、computer use |
| 协作类 | 将任务委派给另一个 Agent | `delegate_to_research_agent` |

把 Agent Tools 比喻成 AI 的“手和脚”很形象，但还不够完整。工具不仅能执行动作，也能读取信息、提供上下文、运行计算或委派任务。

## 5.2 Tool 不等于某一种技术

一个 Tool 的本质是一个**有明确名称、用途、输入和输出约定的能力接口**。

它的内部实现可以是：

- 一段 TypeScript / Python 函数；
- 一个 REST API；
- 一条数据库查询；
- 一个本地脚本；
- 一个远程微服务；
- 一个 MCP Server 暴露出来的工具；
- 一个由平台提供的内置工具。

因此，Tool 是能力层的概念，不是特定协议或编程语言。

## 5.3 一个 Tool 应该包含什么？

一个设计良好的工具通常至少需要：

1. **Name：** 明确的工具名称；
2. **Description：** 说明工具做什么、何时使用、何时不要使用；
3. **Input Schema：** 参数结构、类型、必填项和约束；
4. **Execution Logic：** 真正执行工作的代码或服务；
5. **Output：** 结构化的执行结果；
6. **Error Handling：** 失败时返回明确错误信息；
7. **Permission：** 规定谁可以调用、允许访问什么数据。

例如，一个查询订单的 Tool：

```text
工具名称：get_order
用途：根据订单号查询订单详情
输入：order_id（字符串，必填）
输出：订单状态、金额、客户 ID、创建时间
权限：只能查询当前用户有权访问的订单
副作用：无，只读
```

## 5.4 数据工具与动作工具要区别对待

这是设计 Agent 时非常重要的工程原则。

| 类型 | 示例 | 风险特点 |
|---|---|---|
| Read Tool（读取工具） | 查询客户、读取文件、查询订单 | 通常风险较低，但仍可能泄露敏感信息 |
| Write / Action Tool（写入或动作工具） | 删除记录、发送邮件、修改订单 | 可能产生不可逆或对外可见的副作用 |

建议对写入、删除、付款、发送消息等动作加强权限校验，并在必要时增加用户确认。

---

# 6. Function Calling：模型如何提出工具调用请求

## 6.1 Function Calling 是什么？

Function Calling 通常翻译为“函数调用”。在 LLM 应用中，它指模型根据开发者提供的工具定义，输出一个结构化的调用请求，告诉应用程序：

- 应该调用哪个函数或工具；
- 需要传入什么参数；
- 当前为什么需要这个动作（有些接口会提供额外说明，但不保证总有）。

最重要的一句话：

> **模型通常负责决定是否调用工具、选择工具并生成参数；真正执行函数的是 Agent Runtime、应用后端或工具执行环境。**

所以 Function Calling 并不等于模型直接访问数据库或执行任意代码。

## 6.2 Function Calling 的完整流程

假设应用向模型提供一个函数：

```text
函数名称：get_weather
说明：查询指定城市的天气
参数：location，字符串，必填
```

用户提出：

```text
帮我查一下台北今天的天气。
```

典型流程：

```text
1. 应用把用户问题和工具定义发送给 LLM
                  │
                  ▼
2. LLM 判断需要查询天气
                  │
                  ▼
3. LLM 输出结构化工具调用请求
   get_weather({ "location": "Taipei" })
                  │
                  ▼
4. 应用程序接收到工具调用请求
                  │
                  ▼
5. 应用校验参数、权限和调用策略
                  │
                  ▼
6. 应用真正执行 get_weather 函数
                  │
                  ▼
7. 函数返回天气查询结果
                  │
                  ▼
8. 应用把工具结果再次传给 LLM
                  │
                  ▼
9. LLM 根据结果生成自然语言回答
```

## 6.3 用伪代码理解

下面是简化的 TypeScript 风格伪代码，用来说明职责分工，并非某一家模型 API 的完整可运行示例：

```ts
// 1. 应用程序定义真实函数
async function getWeather(location: string) {
  // 这里才是真正访问天气服务的代码
  return weatherApi.getCurrentWeather(location);
}

// 2. 应用将工具名称、说明和参数 Schema 提供给模型
const tools = [
  {
    name: "get_weather",
    description: "查询指定城市的天气",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string" }
      },
      required: ["location"]
    }
  }
];

// 3. 模型根据用户问题返回普通文本，或结构化工具调用请求
const modelResponse = await callLLM({
  userMessage: "查询台北今天的天气",
  tools
});

// 4. Runtime 判断是否存在工具调用请求
if (modelResponse.toolCall?.name === "get_weather") {
  const args = validateArguments(modelResponse.toolCall.arguments);

  // 5. 应用程序执行真实函数，而不是让模型直接执行
  const result = await getWeather(args.location);

  // 6. 将真实执行结果交还模型，让模型组织最终答复
  const finalResponse = await callLLM({
    userMessage: "查询台北今天的天气",
    toolResult: result
  });

  return finalResponse;
}

return modelResponse.text;
```

真实 API 的请求结构、参数字段、工具调用 ID 和结果回传方式会因模型提供商和 API 版本而不同，但核心流程是一致的。

## 6.4 为什么要先让模型输出请求，而不是直接让它执行？

这种机制把“语言理解和决策”与“真正执行操作”分开：

- 模型擅长理解用户意图、选择工具、组织参数；
- 应用程序掌握函数实现、认证信息、业务权限和运行环境；
- 后端可以校验参数、记录日志、拦截越权操作；
- 工具执行结果能够返回模型，帮助模型继续判断。

这种分工更容易控制，也方便审计和调试。

## 6.5 Function Calling 不代表调用一定成功

模型发出工具调用请求，只代表它提出了一个动作意图。后面还可能发生：

- 参数格式错误；
- 用户没有访问权限；
- API 超时或服务不可用；
- 数据库没有对应记录；
- 业务规则不允许执行；
- 用户取消了操作。

所以系统必须检查工具返回结果，不能仅凭模型输出“已经完成”就判断操作成功。

## 6.6 Function Calling 与 Tool Calling

在很多 LLM 平台和开发语境中，Function Calling 与 Tool Calling 经常被混用。

较宽泛地说：

- Function Calling 强调模型输出一个函数调用请求；
- Tool Calling 强调模型选择并调用某种工具能力。

现代平台可能把函数、内置搜索、文件检索、代码执行、MCP 服务器等统一纳入 Tools 体系。具体接口名称依平台而异。

---

# 7. MCP：Model Context Protocol 到底解决什么问题

## 7.1 MCP 是什么？

MCP 全称是 **Model Context Protocol**，中文一般称为“模型上下文协议”。

它是一套开放协议，目标是让 AI 应用能够以相对统一的方式连接外部数据源和工具服务。

一句话理解：

> **MCP 主要解决 AI 应用与外部工具、数据和上下文之间如何标准化连接、发现能力、交换信息的问题。**

例如，一个 AI 编程助手可能需要连接：

- 本地文件系统；
- GitHub 仓库；
- 数据库；
- 项目管理系统；
- 错误监控平台；
- 企业知识库；
- 第三方 API。

如果每一个 AI 应用都为每一个服务单独开发一套连接方式，会造成大量重复工作。

MCP 希望提供一套共同协议，使得支持 MCP 的客户端可以连接支持 MCP 的服务器，并通过协议发现和使用对方提供的能力。

## 7.2 MCP 解决的核心问题：集成方式不统一

没有统一接入协议时，可能出现这样的局面：

```text
AI 应用 A ── 专门适配 ── GitHub API
AI 应用 A ── 专门适配 ── 文件系统
AI 应用 A ── 专门适配 ── 数据库

AI 应用 B ── 另一套适配 ── GitHub API
AI 应用 B ── 另一套适配 ── 文件系统
AI 应用 B ── 另一套适配 ── 数据库

AI 应用 C ── 第三套适配 ── GitHub API
AI 应用 C ── 第三套适配 ── 文件系统
AI 应用 C ── 第三套适配 ── 数据库
```

集成数量增加后，开发、维护、认证和兼容成本都会上升。

采用 MCP 后，理想的结构是：

```text
AI 应用 A ── MCP Client ──┐
AI 应用 B ── MCP Client ──┼── MCP Server ── GitHub API
AI 应用 C ── MCP Client ──┘              ├── 数据库
                                         └── 文件系统
```

一个 MCP Server 可以将某个系统的能力以标准方式暴露出来；多个 MCP Host 可以在各自权限和配置范围内连接它。

这并不意味着所有服务都只需部署一个 MCP Server，也不意味着任何 MCP 客户端都能无条件访问所有服务器。认证、授权、网络配置和具体能力仍需要正确配置。

## 7.3 MCP 不是 Function Calling 的升级版

这是原始内容中最需要修正的地方。

把 MCP 描述成“Function Calling 的升级版 + 工业标准版”容易产生误解，因为二者解决的问题不同：

- **Function Calling：** 模型如何向 AI 应用表达“我要调用某个函数或工具”。
- **MCP：** AI 应用如何与提供工具或上下文的外部服务进行标准化通信。

可以这样理解：

```text
Function Calling = 模型提出调用意图的接口机制
MCP              = AI 应用与外部能力提供方之间的连接协议
```

二者完全可以一起使用：模型通过 Function Calling 表达调用请求，Agent Runtime 收到请求后，使用 MCP Client 向 MCP Server 发起真正的工具调用。

但并不是所有 Function Calling 都需要 MCP，也不是每一个 MCP 应用都必须把工具暴露成某一家模型厂商的 Function Calling 格式。

## 7.4 MCP 不是什么？

MCP 不是：

- 一个大型语言模型；
- 一个 AI Agent；
- 一个自动思考或规划算法；
- 一个数据库；
- 一个具体的业务 API；
- 一个保证安全的权限系统；
- Function Calling 的同义词。

它是一套连接协议和交互规范。它定义通信双方怎样发现能力、请求数据或调用工具，但不负责替 AI 决定整个任务的业务策略。

---

# 8. MCP 的 Host、Client、Server 架构

理解 MCP，最重要的是先理解三个角色。

## 8.1 MCP Host：宿主应用

MCP Host 是用户实际使用的 AI 应用，负责统筹模型、会话和 MCP 连接。

例如：

- AI 桌面应用；
- AI 编程 IDE；
- 企业内部 AI 助手；
- 自己开发的 Agent 应用。

Host 通常负责：

- 管理与 LLM 的交互；
- 管理会话和上下文；
- 建立和管理 MCP Client；
- 决定哪些 MCP 能力可以提供给模型；
- 展示工具调用状态；
- 实施用户确认和安全策略。

## 8.2 MCP Client：客户端

MCP Client 是 Host 内部负责连接某一个 MCP Server 的组件。

它负责按照 MCP 协议进行通信，例如：

- 发现服务器支持的协议版本和能力；
- 获取服务器提供的工具、资源和提示模板；
- 发送工具调用请求；
- 读取服务器返回的结果；
- 处理协议层的错误和通知。

一个 Host 可以创建多个 MCP Client，分别连接不同 MCP Server。

## 8.3 MCP Server：服务器

MCP Server 是一个实现 MCP 协议的程序，它将外部服务、工具或数据以 MCP 规定的形式暴露出来。

例如，一个企业 CRM MCP Server 可以暴露：

```text
Tools：
- search_customers
- get_customer_detail
- create_followup
- update_customer_status

Resources：
- crm://schema/customers
- crm://docs/sales-process

Prompts：
- generate_customer_summary
- prepare_sales_followup
```

MCP Server 内部可以继续调用企业 CRM 的 REST API、数据库或其他服务。

注意：MCP Server 不一定是一台独立的物理服务器。它可以是本地运行的进程，也可以是远程部署的服务。这里的 Server 指协议架构中的服务端角色。

## 8.4 三者关系图

```text
┌────────────────────────────────────────────┐
│ MCP Host：AI 应用                           │
│                                            │
│  LLM / Agent Runtime                       │
│       │                                    │
│       ├──────── MCP Client A ───────────┐   │
│       │                                 │   │
│       └──────── MCP Client B ────────┐  │   │
└──────────────────────────────────────│──│───┘
                                       │  │
                           MCP 协议通信 │  │ MCP 协议通信
                                       ▼  ▼
                              ┌──────────┐ ┌──────────┐
                              │ Server A │ │ Server B │
                              │ GitHub   │ │ Database │
                              │ MCP      │ │ MCP      │
                              └────┬─────┘ └────┬─────┘
                                   │            │
                                   ▼            ▼
                               GitHub API    PostgreSQL
```

**记忆方法：** Host 是“使用 AI 的应用”，Client 是“连接器”，Server 是“能力提供方”。

---

# 9. MCP 的三类核心能力：Tools、Resources、Prompts

MCP 不只提供工具调用，还定义了几类不同用途的能力。

## 9.1 Tools：工具

Tools 是 MCP Server 暴露给模型使用的可调用能力。

例如：

```text
search_orders(customer_id)
get_order_detail(order_id)
update_order_status(order_id, status)
create_support_ticket(title, description)
```

典型特点：

- 可以被客户端发现；
- 有名称、说明和输入参数 Schema；
- 可以由模型根据任务需要选择；
- 调用后由服务器执行并返回结果；
- 有些工具会产生写入或外部副作用，因此要进行权限控制。

通俗理解：**Tools 是“能做什么”。**

## 9.2 Resources：资源

Resources 是 MCP Server 以标准方式提供给客户端的数据或上下文。

例如：

```text
file:///project/README.md
postgres://database/schema/public
crm://docs/customer-fields
knowledge://company/sales-policy
```

具体 URI 形式由服务实现和约定决定。它们可以代表文件、数据库结构、业务资料、配置说明或其他可读取的数据。

典型特点：

- 用于向 AI 应用提供上下文资料；
- 通常以 URI 标识；
- 客户端可以列出资源并读取内容；
- 由 Host 决定怎样把资源展示或纳入模型上下文。

通俗理解：**Resources 是“可以读取什么资料”。**

## 9.3 Prompts：提示模板

Prompts 是 MCP Server 可以提供给客户端的可复用提示模板。

例如：

```text
analyze_error_log(log_content)
generate_release_notes(version, changes)
review_pull_request(repository, pull_request_id)
```

用户或客户端可以选择一个模板，再提供对应参数。服务器返回结构化的提示消息，Host 可以把它用于后续模型交互。

典型特点：

- 用于复用某类常见任务的 Prompt 模板；
- 可以定义参数；
- 客户端可以发现和读取模板；
- 典型交互方式是用户主动选择某个 Prompt。

通俗理解：**Prompts 是“怎样向 AI 提出某类任务的模板”。**

## 9.4 三者对比

| MCP 能力 | 主要目的 | 典型例子 | 记忆方式 |
|---|---|---|---|
| Tools | 执行操作或查询 | 查询订单、更新客户、创建工单 | 能做什么 |
| Resources | 提供数据和上下文 | README、数据库 Schema、业务规则 | 能读什么 |
| Prompts | 提供可复用提示模板 | 代码审查模板、日志分析模板 | 怎样提出任务 |

一个完整的 MCP Server 可以只实现其中一类，也可以同时实现多类能力，具体取决于它声明和实现的功能。

## 9.5 MCP 的传输方式

MCP 不只是定义“有哪些工具”，也定义客户端和服务器之间怎样交换消息。

常见传输方式包括：

### STDIO

适合本机运行的 MCP Server。

```text
AI Host / MCP Client
        │
        │ 标准输入 stdin / 标准输出 stdout
        ▼
本机 MCP Server 进程
        │
        ▼
本机文件、脚本或其他服务
```

特点：

- Client 通常在本机启动 MCP Server 子进程；
- 通过标准输入和标准输出交换协议消息；
- 不需要额外的网络服务；
- 常见于本地文件系统、开发工具和个人电脑环境。

### Streamable HTTP

适合远程部署的 MCP Server。

```text
AI Host / MCP Client
        │
        │ HTTP 请求 / 响应
        ▼
远程 MCP Server
        │
        ▼
云端 API、数据库或企业服务
```

特点：

- MCP Server 可以独立运行并接受远程连接；
- 使用 HTTP 传输协议消息；
- 可结合身份认证、授权和流式响应；
- 更适合云服务和企业级集成。

协议版本会持续演进，实际开发应以所使用 SDK 和 MCP 规范版本为准。旧版本与较新版本在会话、握手和 HTTP 传输细节上可能存在差异，不要把某一版的底层请求格式当作永久不变的标准。

---

# 10. Function Calling、Tools、API、MCP 的区别与关系

这是最容易混淆的一组概念。

## 10.1 用一个例子区分

假设你开发一个 AI 助手，用户说：

```text
帮我查一下订单 A10086 的物流状态。
```

系统中涉及：

1. **LLM：** 理解用户想查询订单物流；
2. **Agent：** 判断要先获取订单信息，再查询物流；
3. **Tool：** `get_order_logistics`，代表查询物流的具体能力；
4. **Function Calling：** 模型结构化地提出调用 `get_order_logistics` 并传入订单号的请求；
5. **API：** Tool 的内部实现可能调用物流公司的 HTTP API；
6. **MCP：** 如果该物流查询能力通过 MCP Server 提供，那么 AI Host 可以使用 MCP Client 按 MCP 协议调用它。

## 10.2 对照表

| 名词 | 本质 | 解决的问题 | 是否负责真正执行业务逻辑 |
|---|---|---|---|
| LLM | 模型 | 理解、推理、生成 | 通常不直接执行外部业务操作 |
| Agent | 应用运行模式/系统 | 怎样围绕目标组织任务 | 通过 Runtime 和工具实现 |
| Tool | 能力接口 | AI 可以做什么 | 由具体实现负责 |
| Function Calling | 模型与应用之间的调用机制 | 模型如何表达工具调用意图 | 本身不执行函数 |
| API | 软件接口 | 系统之间如何请求服务 | API 后端执行业务逻辑 |
| MCP | 通信协议 | AI 应用如何标准化连接外部能力 | 协议本身不定义业务逻辑 |
| MCP Server | MCP 服务端程序 | 如何把工具和上下文暴露给客户端 | 可以调用 API、数据库或本地程序 |
| MCP Client | MCP 客户端组件 | 如何连接、发现和调用 MCP Server | 负责协议通信，不等于业务服务本身 |

## 10.3 三个问题，快速分辨

- **Function Calling：** 模型怎样告诉程序“我要调用哪个工具、参数是什么”？
- **Agent Tools：** 这个 AI 到底有哪些可以调用的能力？
- **MCP：** AI 应用怎样用相对统一的方式连接外部工具和上下文提供方？

这三个问题不同，所以它们不是互相替代的关系。

---

# 11. 把所有概念串起来：一个完整的任务执行案例

下面以“生成一份项目 API 设计文档”为例，串起前面所有概念。

## 11.1 用户提出任务

```text
请检查我的 Vue + Supabase 项目：
1. 阅读项目目录和前后端代码；
2. 获取数据库所有业务表和函数定义；
3. 梳理前端调用、数据库对象和业务模块的关系；
4. 生成一份完整的 API 设计文档；
5. 将文档保存为 API_DESIGN.md。
```

## 11.2 指令层开始工作

System Prompt 可能规定：

```text
你是一个严谨的软件工程 Agent。
不得编造没有读取到的代码和数据库结构。
不确定的信息必须标记为待确认。
```

Developer Prompt 可能规定：

```text
你可以使用文件读取、数据库查询和文件写入工具。
分析数据库结构时优先读取 Schema 和函数定义。
生成文档前要检查章节完整性。
不得修改业务代码和生产数据。
```

User Prompt 则提供本次具体项目路径和交付目标。

## 11.3 Agent 制定执行步骤

```text
任务一：读取项目目录结构
任务二：读取前端路由、页面和 API 调用代码
任务三：获取 Supabase 数据表 Schema
任务四：获取数据库函数定义
任务五：整理模块与数据关系
任务六：生成 API_DESIGN.md
任务七：检查文档内容和文件是否成功保存
```

这些步骤可以由模型动态规划，也可以由应用预先设定一部分固定流程。

## 11.4 发现并选择 Tools

Agent 可用的工具可能包括：

```text
read_project_files(path)
search_code(keyword)
get_database_schema()
get_database_functions()
write_file(path, content)
```

这些就是 Agent Tools。它们背后的实现可以是本地 TypeScript 函数、数据库 SDK，也可以是 MCP Server 提供的能力。

## 11.5 模型通过 Function Calling 提出调用请求

例如模型决定先读取目录：

```json
{
  "name": "read_project_files",
  "arguments": {
    "path": "/project"
  }
}
```

这只是结构化调用请求。Runtime 接收到后，才会真正读取目录并把执行结果交还模型。

接下来模型根据结果，可能再次调用 `search_code`、`get_database_schema` 等工具。

## 11.6 通过 MCP 连接工具服务

假设数据库能力是由 Supabase MCP Server 暴露出来的：

```text
Agent Runtime
     │
     ▼
MCP Client
     │
     │ MCP tools/list：发现工具
     │ MCP tools/call：发起调用
     ▼
Supabase MCP Server
     │
     ▼
Supabase 数据库/API
```

这里，MCP 提供的是连接与调用的协议；数据库查询本身仍然由 MCP Server 及其后端实现完成。

## 11.7 返回结果、继续判断、最终交付

工具结果返回给 Agent 后，模型可能发现：

- 有些表没有对应的前端调用；
- 某些前端模块使用了数据库函数；
- 某些函数依赖其他表；
- 项目中存在命名不一致或缺失说明的接口。

Agent 可以进一步查询、整理、标记疑点，最终生成文档并通过文件工具写入。

最后，系统应检查文件是否确实生成、内容是否完整，再向用户报告结果。

## 11.8 这个例子里每个概念具体扮演什么角色？

| 概念 | 在案例中的职责 |
|---|---|
| System Prompt | 要求严谨，不编造数据库和代码信息 |
| Developer Prompt | 规定可用工具、分析流程和禁止修改生产数据等规则 |
| User Prompt | 指定项目和 API 文档交付要求 |
| LLM | 理解目标、分析结果、决定下一步 |
| Agent | 组织多步骤任务并持续执行直到交付 |
| Tools | 读取文件、搜索代码、获取 Schema、写文档 |
| Function Calling | 将工具选择和参数结构化表达出来 |
| MCP | 让 AI 应用以标准协议连接数据库相关工具服务 |
| API / Database | 真正提供项目和数据能力的后端系统 |

---

# 12. 典型误区与纠正

## 误区 1：MCP 是 Function Calling 的升级版

**纠正：** Function Calling 关注模型如何提出调用请求；MCP 关注 AI 应用如何连接外部能力和交换上下文。它们可以配合使用，不是简单的替代关系。

## 误区 2：只要 LLM 能生成计划，它就是 Agent

**纠正：** 输出计划只是生成文本。典型 Agent 还需要运行时控制、工具执行、结果反馈和完成判断。

## 误区 3：Agent 一定要有长期记忆

**纠正：** Memory 是常见能力，但不是所有 Agent 的必要条件。一次性任务也可以由 Agent 完成。

## 误区 4：Agent Tools 就是 MCP Tools

**纠正：** Agent Tools 是更广泛的能力概念，可以来自本地函数、内置工具、API、SDK 或 MCP Server。MCP Tools 只是通过 MCP 暴露的一类工具。

## 误区 5：MCP Server 就是一个 AI Agent

**纠正：** MCP Server 通常是外部能力提供方。它可以只提供数据库查询、文件读取等服务，本身不必具备自主规划和任务决策能力。

## 误区 6：模型说“已完成”，就代表操作成功

**纠正：** 必须检查真实工具执行结果。工具调用可能失败、超时、被拒绝或只完成了一部分。

## 误区 7：接入 MCP 后，AI 就能访问所有数据

**纠正：** MCP 不会自动授予权限。服务器暴露什么能力、用户拥有什么授权、Host 允许调用什么，都必须明确配置。

## 误区 8：所有 AI 应用都应该使用 Agent 和 MCP

**纠正：** 简单问答可能只需要一次 LLM 调用；固定业务流程可以由普通代码或工作流完成；只有在需要动态决策和多步执行时才值得引入 Agent。只有在需要标准化连接外部 MCP 服务时，MCP 才带来直接价值。

## 误区 9：Prompt 可以代替后端权限控制

**纠正：** Prompt 只能引导模型行为，不能代替真正的权限校验。后端必须检查用户身份、访问范围、参数合法性和业务约束。

---

# 13. 实际开发中应该怎样选择技术方案

不必一开始就上完整 Agent 框架和 MCP。可以按需求逐步增加复杂度。

## 场景 A：只是问答和文本生成

例如：总结文章、解释 TypeScript 错误、翻译文档。

建议：

```text
User Prompt + Instructions + LLM
```

没有必要为了使用 Agent 而使用 Agent。

## 场景 B：模型需要调用一两个自定义函数

例如：查询订单、获取当前用户信息、计算某项业务指标。

建议：

```text
LLM + Function Calling + 自定义函数
```

由应用程序定义工具 Schema，并负责执行真实函数。

## 场景 C：多步骤任务，需要根据结果动态决定下一步

例如：自动分析项目、排查异常、跨系统收集资料并生成报告。

建议：

```text
LLM + Agent Runtime + Tools + 执行循环
```

必要时添加 Memory、任务状态、检查点、权限和人工确认。

## 场景 D：需要连接多个外部工具服务，并希望复用集成

例如：多个 AI 应用都要访问 GitHub、数据库、文件系统、监控平台和企业知识库。

建议考虑：

```text
AI Host / Agent Runtime + MCP Client + 多个 MCP Server
```

这样可以让外部服务以统一协议暴露能力，减少不同 AI 应用重复开发适配器的工作。

## 场景 E：固定、可预测的自动化业务流程

例如：每天定时读取 Excel、判断条件、更新文件、发送 Teams 通知。

不一定需要 Agent。普通代码、Power Automate 或其他工作流工具可能更稳定、便宜、容易审计。

## 13.1 一个实用的技术选型原则

| 需求特点 | 优先考虑 |
|---|---|
| 一次问答、总结、生成 | 直接 LLM 调用 |
| 需要结构化输出 | Structured Output / JSON Schema |
| 需要调用自定义业务函数 | Function Calling |
| 固定步骤、固定条件 | 普通代码 / Workflow |
| 任务步骤不确定，需要动态选择工具 | Agent |
| 多个 AI 客户端需要复用外部服务接入 | MCP |
| 高风险写操作 | 工具权限校验 + 用户确认 + 审计日志 |

**核心原则：先用最简单的方案解决问题，只有当复杂度确实需要时再增加 Agent、MCP 或多 Agent 架构。** Agent 通常会带来额外的模型调用、延迟、成本和调试难度。

---

# 14. 安全、权限与工程实践

当 AI 从“生成文字”变成“能够操作系统”，安全就不再是可选项。

## 14.1 最小权限原则

不要把所有工具、所有数据和所有操作权限都交给 Agent。

例如：

- 只需要查询订单，就不要开放删除订单的工具；
- 只需要读取项目文件，就不要开放整个磁盘写入权限；
- 只需要读取数据库 Schema，就不要使用数据库管理员账号；
- 只需要发送草稿，就不要直接授予群发权限。

## 14.2 高风险操作增加人工确认

以下操作适合增加确认步骤：

- 删除数据或文件；
- 修改生产数据库；
- 发送邮件、消息或公开内容；
- 转账、付款或购买；
- 修改账号权限；
- 部署生产环境。

建议把工具分级：

```text
低风险：只读查询 → 可按权限自动执行
中风险：创建草稿、生成文件 → 可自动执行并记录
高风险：删除、发送、付款、生产修改 → 必要时人工确认
```

## 14.3 工具参数必须由程序校验

即使模型输出了符合 JSON 结构的参数，也要由执行层再次校验：

- 类型是否正确；
- 参数是否缺失；
- 字段值是否在允许范围；
- 当前用户是否有权访问目标资源；
- 是否违反业务规则；
- 是否可能造成 SQL 注入、路径穿越或其他安全风险。

## 14.4 防范 Prompt Injection

Agent 可能读取网页、邮件、文档、代码仓库或其他外部内容。这些内容中可能包含恶意指令，例如要求忽略原规则、泄漏密钥或执行不相关操作。

需要明确区分：

- 系统和开发者指令；
- 用户真实请求；
- 从网页、文件和工具结果中读取的外部数据。

外部数据应该作为待分析的内容，而不是自动提升为更高优先级的指令。对于工具返回的内容，不能因为它“看起来像命令”就直接执行。

## 14.5 日志、审计与可追踪性

生产级 Agent 至少应考虑记录：

- 用户提出了什么任务；
- 模型选择了哪个工具；
- 调用时传入了什么参数；
- 哪个用户或服务身份执行了调用；
- 工具返回了什么结果；
- 是否有权限拦截或人工确认；
- 最终任务是否成功完成。

日志中应避免无必要地保存密码、Token、密钥和敏感个人信息。

---

# 15. 最后用一张表记住所有概念

| 名词 | 一句话理解 | 类比 |
|---|---|---|
| System Prompt | 定义 AI 的高优先级行为规范和边界 | 公司基本制度 |
| Developer Prompt | 定义某个 AI 应用的业务规则和工作方式 | 岗位职责说明 |
| User Prompt | 用户本次提出的任务和要求 | 给助理下达的任务 |
| LLM | 理解输入、判断并生成内容的模型 | 大脑 / 知识与推理引擎 |
| AI Agent | 围绕目标组织决策、工具调用和反馈的系统 | 能使用系统完成任务的助理 |
| Agent Runtime | 控制 Agent 执行流程、状态和工具调度的运行环境 | 助理的工作台和调度系统 |
| Agent Tools | Agent 可以使用的实际能力 | 手、脚和专业设备 |
| Function Calling | 模型结构化表达工具调用意图的机制 | 助理填写一张操作申请单 |
| API | 软件系统对外提供的服务接口 | 系统之间约定好的办事窗口 |
| MCP | AI 应用与外部能力之间的标准化连接协议 | 统一的接口和通信规则 |
| MCP Host | 管理模型和 MCP 连接的 AI 应用 | 办公室 / 主工作台 |
| MCP Client | 连接某个 MCP Server 的客户端组件 | 连接器 |
| MCP Server | 通过 MCP 提供工具和上下文的服务端程序 | 外部服务柜台 |
| MCP Tools | MCP Server 暴露的可调用工具 | 可以办理的业务 |
| MCP Resources | MCP Server 暴露的数据和上下文 | 可以查阅的资料 |
| MCP Prompts | MCP Server 提供的可复用提示模板 | 标准任务模板 |

## 最终记忆公式

```text
Prompt       = 指令与输入：告诉 AI 应该怎么做、现在要做什么
LLM          = 理解与生成：理解上下文并决定下一步输出
Agent        = 任务组织：围绕目标规划、执行、观察和调整
Runtime      = 执行控制：管理状态、调用工具、检查权限和结果
Function Call= 调用请求：把模型的工具调用意图结构化表达出来
Tool         = 实际能力：查询数据、读写文件、运行代码、调用 API
MCP          = 接入协议：让 AI 应用标准化连接外部工具和上下文
API          = 业务接口：真正提供数据或执行具体业务操作
```

更口语化地说：

> **用户通过 User Prompt 提出目标；System/Developer Prompt 规定 AI 的行为和工作边界；LLM 负责理解与判断；Agent Runtime 组织整个任务；模型通过 Function Calling 提出工具调用请求；Tools 执行实际操作；如果工具通过 MCP 暴露，AI 应用就可以用 MCP Client 按统一协议连接 MCP Server；外部 API、数据库或文件系统最终提供真实的数据和执行能力。**

这就是这些概念之间最完整、也最不容易混淆的关系。

---

# 16. 官方资料与延伸阅读

以下资料用于进一步核对概念和了解具体实现。协议和 API 会持续迭代，实际开发时应以官方最新文档、所用 SDK 版本和服务端实现为准。

## OpenAI

1. [Prompt Engineering：提示词设计与消息角色](https://developers.openai.com/api/docs/guides/prompt-engineering)
2. [Function Calling：函数调用机制](https://developers.openai.com/api/docs/guides/function-calling)
3. [Tools：模型可使用的工具类型](https://developers.openai.com/api/docs/guides/tools)
4. [Agents：Agent 运行与多步骤任务](https://developers.openai.com/api/docs/guides/agents)
5. [A Practical Guide to Building Agents：Agent 设计实践](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)

## Anthropic

6. [Building Effective Agents：Workflow 与 Agent 的区别](https://www.anthropic.com/research/building-effective-agents)

## Model Context Protocol

7. [MCP 官方文档：Architecture Overview](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture)
8. [MCP Specification：Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
9. [MCP Specification：Resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)
10. [MCP Specification：Prompts](https://modelcontextprotocol.io/specification/2026-07-28/server/prompts)
11. [MCP Security Best Practices：安全最佳实践](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)

---

**文档结束。**

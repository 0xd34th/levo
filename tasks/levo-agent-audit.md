# `packages/levo-agent` Sui Move 安全审计报告

| 项目 | 内容 |
|---|---|
| 范围 | `packages/levo-agent` (4 modules + 1 test file) |
| 方法 | Sui-scanner 工作流（10 步）+ 设计文档对照 |
| 工具链 | Sui 1.70.1, edition 2024.beta |
| 测试结果 | 修复后 39/39 PASS（`sui move test`），`sui move build` PASS |
| 部署状态 | Testnet `0xd154d5…d8d1b` 仍是修复前 v1；UpgradeCap 由部署者 EOA 持有；Mainnet 未发布 |
| 审计依据 | `~/.claude/plans/we-can-add-an-cozy-elephant.md`、`MEMORY/levo_agentic_wallet_decision.md` |
| Codex 复核 | 2026-05-14：对照源码、设计记忆、Seal 官方文档与 testnet UpgradeCap owner 复核；初始基线 `sui move test` 22/22 PASS |

---

## 0. 摘要 / 结论先行

整体上 4 个模块结构清晰、能力（abilities）配置合理、热土豆收据（`WitnessReceipt` 无 abilities）强制 PTB 内消费的设计是正确的。但 **设计文档的"Seal 提供 next_commit"决策在 Move 端没有获得对应的强制约束**——一旦 agent 拿到第一个 witness 预像，就能在不再请求 Seal 的情况下无限次复用，把整个 Seal MPC 层架空。这是本次审计最关键的发现。

> 一句话：**Seal 层在当前实现下可被 agent 单方面绕过**。其它发现多为硬化项与限额上限缺失。

| # | 严重度 | 模块 | 摘要 |
|---|---|---|---|
| F-1 | **CRITICAL** | `mandate::rotate_witness` | `next_commit` 不强制 ≠ `witness_commit`，agent 可冻结 witness 链，使 Seal 绕过 |
| F-2 | **CRITICAL** | publish 流程 | `UpgradeCap` 由单一 EOA 持有，可任意替换合约逻辑（mainnet blocker） |
| F-3 | **HIGH** | `consume_witness` | witness/commit 与 (mandate_id, action, target, amount) 无加密绑定，跨调用篡改可能 |
| F-4 | **HIGH** | `seal_policy::seal_approve` | `_id` 参数被忽略，Seal blob 隔离失效（旧 blob 可借当前 mandate 解出） |
| F-5 | **HIGH** | `mandate::set_initial_witness` | agent 单方面写入 initial commit，无法链上验证它源自 Seal |
| F-6 | MEDIUM | `mandate::assert_target_allowed` | 空 `allowed_targets` = 允许任意目标（默认 footgun） |
| F-7 | MEDIUM | `mandate::create` | `period_ms` / `expiry_ms` / `allowed_targets` / `coin_limits` / `metadata` 无上界，加法溢出致自锁、链上读取被 grief |
| F-8 | MEDIUM | `mandate::actions` 位域 | `proposed_action` 可携多 bit，Seal `check` 仅做按位与，与单 action 语义不一致 |
| F-9 | LOW | `WitnessConsumed` 事件 | 缺序号/witness commit hash，链下排序难度大 |
| F-10 | LOW | `ACTION_MASK_ALL` | 写死 `63`，新增动作易遗忘同步 |
| F-11 / N-1 | MEDIUM | `action_registry` / `mandate::create` | V1 仅实现 deposit/withdraw/harvest；`create` 若允许 SEND/SWAP/PULL 会产生不可执行 witness |

**Codex 复核结论**：
- F-1/F-2/F-3/F-4/F-7/F-8 均成立，且 F-1/F-3/F-4 是同一个 Seal witness 语义闭环问题，应作为 Phase A 一起修。
- F-1 原文的"确定性派生 next commit"与当前已锁定 Spec（Seal 提供 `next_commit` 参数）不一致；除非重开产品/协议决策，否则推荐修复应是 **校验推进 + 把 next_commit/blob id 与 action context 绑定**，不是直接移除 `next_commit`。
- F-7 原文建议的 `VecMap<address, ()>` / `VecMap<TypeName, CoinLimit>` 不能声称 O(log n)：Sui `VecMap` 仍是 vector-backed 结构，收益主要是语义清晰，不是复杂度下降。当前更直接的修复是加长度上界并避免加法溢出。
- F-8 原文的 `action.count_ones()` 不是当前 Move 代码里可直接依赖的写法；应使用位运算 helper。

**修复状态（2026-05-14）**：
| # | 状态 | 说明 |
|---|---|---|
| F-1 | Fixed in source | `rotate_witness` 改为校验 action-bound commit，并拒绝空/不推进的 `next_commit` |
| F-2 | Open deployment task | 需要链上把 UpgradeCap 转 multisig/收紧 upgrade policy；本轮未执行权限转移 |
| F-3 | Fixed in source | `derive_action_commit` 把 witness 与 `(mandate_id, action, target, coin_type, amount, next_commit)` 绑定 |
| F-4 | Fixed in source | `seal_approve` 校验 requested identity，identity 绑定当前 commit、action context 与 next commit |
| F-5 | Open protocol/product task | `set_initial_witness` 仍由 agent 写入；需 owner 共同初始化或 Seal 签名验证 |
| F-6 | Fixed in source | `create` 禁止空 `allowed_targets` |
| F-7 | Fixed in source | 增加 period/targets/coin limits/metadata 上界，并改成无溢出的限额计算 |
| F-8 | Fixed in source | `assert_action_allowed` 与 `seal_policy::check` 均要求单 bit action |
| F-9 | Open observability task | 事件仍未加 nonce / before-after commit |
| F-10 | Fixed in source | `ACTION_MASK_ALL` 改为由 bitwise OR 派生 |
| F-11 / N-1 | Fixed in source | V1 `create` / consume / Seal predicate 均闸住 SEND/SWAP/PULL，仅允许 earn_* |

---

## 1. 模块与对象总览

### 模块
| 模块 | 角色 | 关键导出 |
|---|---|---|
| `mandate` | 核心对象/限额/见证链 | `Mandate{key}`, `CoinLimit{store,drop,copy}`, `create`, `share`, `set_initial_witness`, `revoke`, `update_expiry`, package: `assert_active/action_allowed/target_allowed`, `coin_limit_mut`, `limit_check_and_consume`, `rotate_witness` |
| `payment` | 见证消费 + 热土豆生成 | `WitnessReceipt{无 abilities}`, `consume_witness<C>`, package: `unpack_for_action<C>` |
| `action_registry` | 动作授权事件发射 | `authorize_earn_{deposit,withdraw,harvest}`, `authorize_for_action` |
| `seal_policy` | Seal 委员会解密前的只读 predicate | `seal_approve`, `check`, test: `check_with_type` |

### 关键对象
| 对象 | abilities | 所有权 | 备注 |
|---|---|---|---|
| `Mandate` | `key` | 创建后由 owner 决定 `share` 或保持 owned | 无 `store` → 防止意外 wrap/`public_transfer` ✓ |
| `WitnessReceipt` | 无 | 函数返回值 | 真正的 hot-potato ✓ |
| `CoinLimit` | `store, drop, copy` | 嵌入 `Mandate.coin_limits` | `copy` 用于读取 getter 时复制（合理） |
| 包内事件结构 | `copy, drop` | 仅 emit | 合规 |

✓ 没有 `fun init` 也未声明 OTW —— 合理：模块无单例需要初始化。

---

## 2. 详细发现

### F-1【CRITICAL】Agent 可冻结 witness 链，整层 Seal 失效

**位置**：`sources/mandate.move:249-263`

```move
public(package) fun rotate_witness(
    mandate: &mut Mandate,
    witness: &vector<u8>,
    next_commit: vector<u8>,
) {
    assert!(!mandate.witness_commit.is_empty(), EWitnessNotInitialized);
    let provided_hash = sui::hash::blake2b256(witness);
    assert!(provided_hash == mandate.witness_commit, EInvalidCommit);
    assert!(!next_commit.is_empty(), EInvalidCommit);
    mandate.witness_commit = next_commit;          // ← 未校验差异
    ...
}
```

**威胁路径**：
1. Seal 释放 witness 预像 `W_0`，链上当前 `commit = H(W_0)`。
2. Agent 调用 `consume_witness(W_0, next_commit = H(W_0))`（即把"下一个 commit"原样写回）。
3. 链上 `commit` **未推进**，但 `W_0` 已在交易输入里公开。
4. Agent（持单一平台 KMS 私钥）下次仍以 `(W_0, next_commit = H(W_0))` 调用 → 通过；可在 mandate 限额/有效期内**无限重放**。

由于设计文档明确将"Seal 出 next_commit"作为 MPC 层的核心约束（`MEMORY/levo_agentic_wallet_decision.md` 与 `we-can-add-an-cozy-elephant.md` 第 350-354 行），此处缺失校验等价于：

- Seal 的"逐动作放行"在第一次之后形同虚设
- agent KMS 泄漏后，攻击者无须再触达 Seal MPC 即可继续在 mandate 限额内动账

测试 `consume_aborts_on_witness_replay` 只覆盖了"重用旧 witness 预像但 commit 已推进"的场景，**未覆盖 next_commit == current 的情况**。

**修复（最低）**：
```move
assert!(next_commit != mandate.witness_commit, EInvalidCommit);
```

**修复（推荐，贴合当前 Spec）**：保留当前已锁定的"Seal 提供 `next_commit` 参数"模型，但 Move 端必须同时强制：
1. `next_commit != mandate.witness_commit`
2. `next_commit` 是 Seal 对本次 `(mandate_id, action, target, amount, coin_type, current_commit)` 授权后给出的下一段 commit
3. `seal_policy::seal_approve` 的 `id` 与同一上下文绑定，避免 decrypt 旧 blob 或错误 blob

确定性派生方案只能作为协议重开后的替代设计：
```move
mandate.witness_commit = sui::hash::blake2b256(
    &vector_concat(witness, &object::id_to_bytes(&object::id(mandate)))
);
```
它的优点是 agent 无法对 commit 链做任何手脚；缺点是会推翻当前 `levo_agentic_wallet_decision.md` 中"Seal-provided `next_commit`"的 locked decision，需要同步改 Seal SDK/backend 流程，不能当作本轮默认修复。

附加：把 `witness_commit` 改为 `Option<vector<u8>>` 或维护一个递增 `nonce: u64` 以让外部观察者能验证链的长度。

---

### F-2【CRITICAL — mainnet blocker】`UpgradeCap` 单点

**位置**：testnet 已发布；`Published.toml` 显示 `upgrade-capability = 0x7405390c…0db6`。Codex 复核 `sui client object --json 0x7405390c...0db6`，当前 owner 为 `AddressOwner 0xc46c0372…7c49`（单 EOA）。

任何持有该 cap 的人可以发布 `compatible` upgrade，把 `assert!` 全部换成 no-op，把全部已存在的 `Mandate` 对象转为攻击者可调用。

**修复路径**（按推荐优先级）：
1. 立刻把 UpgradeCap 转入 multisig（Sui 上可用 native multisig 地址或 zkLogin + Privy 联合签）。
2. mainnet 发布前调用 `package::only_additive_upgrades(&mut upgrade_cap)`，进一步收紧到 `dep_only`。
3. V1 稳定后调用 `package::make_immutable(upgrade_cap)`。

> 本项目记忆 `levo-agent-published-ids` 已明示"mainnet 未发布，需 audit + Seal mainnet 可用"。这条结论需要加上："UpgradeCap 必须先转 multisig"。

---

### F-3【HIGH】Witness 与 (action, target, amount) 无加密绑定

**位置**：`payment::consume_witness`（`sources/payment.move:33-74`）+ `mandate::rotate_witness`

`consume_witness` 仅校验 `blake2b256(witness) == mandate.witness_commit`。witness 内容与本次声明的 `(action_type, target, amount, coin_type)` 之间没有任何加密绑定。

后果：Seal 委员会基于 `seal_approve(action=DEPOSIT, target=V1, amount=100, …)` 释放了某个 witness `W`，agent 拿到 `W` 后可以在同一 mandate 框架内自由地把 `(action_type, target, amount, coin_type)` 改成任何依然满足 mandate 静态约束的组合（例如 `WITHDRAW, V1, 80`）。

这弱化了 Seal 的"逐动作审查"价值——Seal 实际授予的是"通行证"，不是"凭据"。

**修复**：把 commit 绑定到调用上下文，例如
```move
let bound = sui::hash::blake2b256(
    &concat(witness, object::id_bytes(mandate), action_type.to_be_bytes(),
            bcs::to_bytes(&target), amount.to_be_bytes(),
            bcs::to_bytes(&type_name::with_defining_ids<C>()))
);
assert!(bound == mandate.witness_commit, EInvalidCommit);
```
Seal 端需要按同样规则在生成 commit 时把动作上下文混入。

> 这与 F-1 协同：若选 F-1 "推荐"方案，可直接把动作上下文写进 next_commit 的派生中。

---

### F-4【HIGH】`seal_approve` 忽略 `_id`，Seal blob 隔离失效

**位置**：`sources/seal_policy.move:10-20`

```move
public fun seal_approve(
    _id: vector<u8>,              // ← 未使用
    mandate: &Mandate,
    proposed_action: u32,
    ...
) {
    assert!(check(mandate, ...), ENotApproved);
}
```

Seal 模式下，`_id` 是被加密的 blob 标识。policy 检查若不使用 `_id`，等价于"任何在该 mandate 下满足策略的 blob 都可解密"。后果：
- 老的、已经被消费过的 witness blob 如果还存在于客户端缓存或外部存储，agent 可借当前 mandate 状态再次解密（虽然旧 witness 由于 F-1 已修复后会失败，但信息泄露面变大）。
- 没法用 `_id` 做"一个 mandate 一段时间一个唯一 blob"的强绑定。

**修复**：要求 `_id` 至少包含 `(mandate_id, witness_commit, slot_nonce)`，并在 `check` 中验证：
```move
public fun seal_approve(
    id: vector<u8>,
    mandate: &Mandate,
    ...
) {
    // expected_id = blake2b256(mandate_id || witness_commit || serialized(action,target,amount,coin))
    let expected = derive_blob_id(mandate, proposed_action, proposed_target, proposed_coin_type, proposed_amount);
    assert!(id == expected, EBlobIdMismatch);
    assert!(check(mandate, ...), ENotApproved);
}
```

> 与 F-3 一并修复最有效。

Codex 复核补充：Seal 官方文档要求 `seal_approve*` 第一个参数是 requested identity（去掉 package ID 前缀），并且解密 PTB 只能直接调用 `seal_approve*`。因此 `_id` 不是可忽略占位参数，而应作为本 policy 的核心绑定输入。

---

### F-5【HIGH】`set_initial_witness` 让 agent 单方面定 commit

**位置**：`sources/mandate.move:166-172`

```move
public fun set_initial_witness(mandate: &mut Mandate, commit: vector<u8>, ctx: &TxContext) {
    assert!(ctx.sender() == mandate.agent, ENotAgent);
    assert!(!commit.is_empty(), EInvalidCommit);
    assert!(mandate.witness_commit.is_empty(), EWitnessAlreadyInitialized);
    mandate.witness_commit = commit;
    ...
}
```

设计文档第 342-343 行说明：服务端先 `Seal SDK registerMandate(mandate_id)` 拿到初始 commit，再用 agent KMS 调用 `set_initial_witness`。但 Move 层无法验证 `commit` 真的源自 Seal。如果 agent 在初始化阶段就作恶（KMS 泄漏在 init 之前），可写入自己生成的 commit，整个 mandate 生命周期都在 Seal 之外。

**修复思路**：
1. **owner 共同初始化**：把 `set_initial_witness` 拆成两段，要求 `owner` 也参与（例如 owner 在创建时就要传 commit），或要求初始化交易必须由 owner 发起、并把 agent 的 commit 作为 owner 的输入参数。
2. **链上验证 commit 来源**：引入 Seal 委员会的公钥签名，把 `commit` 改成 `commit_with_sig`，Move 端验 BLS 签名 → 难度高，但能彻底关掉这条路径。
3. **退路**：若选项 1/2 都不做，至少在事件中显式标记 "INITIAL_WITNESS_SET"，并在 owner 侧 dashboard 强制要求 owner 在 N 分钟内确认；超时则强制 revoke。

考虑 V1 MVP "agent 是平台 KMS 单一私钥"且无外部攻击者意识到这条路径，**短期内可接受为有意识的风险**，但需在 mainnet 之前补上选项 1（owner 共同初始化），并在用户端文案中明示。

---

### F-6【MEDIUM】空 `allowed_targets` = 允许任意目标

**位置**：`sources/mandate.move:210-219`、`seal_policy.move:55-65`

```move
public(package) fun assert_target_allowed(mandate: &Mandate, target: address) {
    if (mandate.allowed_targets.is_empty()) return;     // ← 默认放过
    ...
}
```

意图可能是"未限定 → 不限制"，但调用方（前端/SDK）只要忘传 `allowed_targets`，就给了 agent 全网络转账权限（在 actions/coin_limits 仍然约束的前提下）。

**修复**：
- 在 `create` 中显式 `assert!(!allowed_targets.is_empty(), ENoAllowedTargets);`
- 或保留"空 = 通配"语义，但在 `MandateCreated` 事件里把这件事单独打标，方便 owner 仪表盘做警示。

---

### F-7【MEDIUM】无上界 → 自锁/链上读取 grief

**位置**：`mandate::create`

| 字段 | 当前约束 | 风险 |
|---|---|---|
| `period_ms` | 仅 `> 0` | `u64::MAX` 时 `period_start_ms + period_ms` 溢出 abort（永久 DoS） |
| `expiry_ms` | 仅 `> now` | 上界无限制（用户自伤型；可接受） |
| `allowed_targets.length()` | 无 | `assert_target_allowed` 与 `seal_approve` 线性扫描 → off-chain Seal 委员会 gas / CPU grief |
| `coin_limits.length()` | 无 | `coin_limit_mut<C>` 线性扫描 → 同上 |
| `metadata` (VecMap) | 无 | 单 mandate 上链存储无上限 |

**修复**：
```move
const MAX_PERIOD_MS: u64 = 365 * 86_400_000;    // 1 year
const MAX_TARGETS: u64 = 32;
const MAX_COIN_LIMITS: u64 = 16;
const MAX_METADATA_ENTRIES: u64 = 16;

assert!(period_ms <= MAX_PERIOD_MS, EInvalidPeriod);
assert!(allowed_targets.length() <= MAX_TARGETS, ETooManyTargets);
assert!(n <= MAX_COIN_LIMITS, ETooManyCoinLimits);
assert!(metadata_keys.length() <= MAX_METADATA_ENTRIES, ETooManyMetadata);
```

同时把 period rollover 与 period cap 的加法改为先做边界判断或使用安全差值，避免 `period_start_ms + period_ms`、`period_spent + amount` 溢出走 VM arithmetic abort。

可选结构调整：若未来需要按 key 查询语义，可改成 `VecMap<TypeName, CoinLimit>` 或 `VecSet<address>`；但这不是 O(log n) 优化，Sui `VecMap` 仍是 vector-backed，必须继续依赖长度上界控制 gas/CPU。

---

### F-8【MEDIUM】多 bit `proposed_action` 语义不一致

**位置**：`mandate::assert_action_allowed`、`seal_policy::check`

```move
public(package) fun assert_action_allowed(mandate: &Mandate, action: u32) {
    assert!(mandate.actions & action != 0, EActionNotAllowed);
}
```

调用者传 `action = ACTION_EARN_DEPOSIT | ACTION_SEND` 时，只要 mandate 允许其中任一就通过——但 `action_registry::authorize_for_action` 会以 `if (action == EARN_DEPOSIT)` 严格匹配，多 bit 直接走到 `EUnknownAction` 分支 abort。所以在 consume 流程里安全，但 **`seal_policy::seal_approve` 是只读的，多 bit 入参会被错误放过**，Seal 可能因此对一个不存在的"复合动作"释放 witness。

**修复**：在两处都加单 bit helper；不要依赖 `count_ones()` 这类非本包现有 API：
```move
fun is_single_action(action: u32): bool {
    action != 0 && (action & (action - 1)) == 0
}
assert!(is_single_action(action), EActionNotAllowed);
```

---

### F-9【LOW】`WitnessConsumed` 事件信息不足

`mandate_id, action_type, coin_type, target, amount, at_ms` 没带：
- 当前 commit hash（让链下能确认是哪一段 witness）
- 序号/nonce
- WitnessReceipt 的最终 sink（哪个 authorize_* 收尾）

**修复**：emit 时附 `witness_commit_before` / `witness_commit_after` / `mandate_nonce: u64`（如增加 nonce 字段）。

---

### F-10【LOW】`ACTION_MASK_ALL = 63` 写死

新增动作时（如 SWAP_V2、BORROW）很容易忘记同步 mask 与 `action_registry::authorize_for_action` 分支。

**修复**：用 bitwise OR (`|`) 导出：
```move
const ACTION_MASK_ALL: u32 =
    ACTION_SEND | ACTION_EARN_DEPOSIT | ACTION_EARN_WITHDRAW
    | ACTION_EARN_HARVEST | ACTION_SWAP | ACTION_PULL;
```

---

### F-11 / N-1【MEDIUM】V1 未实现动作必须在 mandate 入口闸住

`mandate` 暴露了 6 个动作（SEND/EARN_DEPOSIT/EARN_WITHDRAW/EARN_HARVEST/SWAP/PULL），但 `action_registry` 只实现 deposit/withdraw/harvest。

V1 MVP 决策（记忆中已记录）就是 yield-only，所以 action registry 只实现 earn_* 与设计一致。但不能让 mandate 的 `actions` mask 接受 SEND/SWAP/PULL：Seal 可按未实现 action 释放 witness，随后 PTB 在 `authorize_for_action` 回滚，链上 commit 不推进而 witness 已泄露给 agent，导致当前 witness 链卡住直到 revoke 或 expiry。

**修复状态**：已保留预留常量/getter，但新增 V1 action mask；`mandate::create`、`mandate::assert_action_allowed`、`seal_policy::check` 都拒绝 SEND/SWAP/PULL。

---

## 3. 测试覆盖评估

**已覆盖（修复后 39 条 PASS）**：
- happy path（deposit→harvest 链式）
- period 滚动
- 撤销/过期/未授权 action/未授权 target/超 per-tx/超 period/错误 coin
- 见证重放（旧 witness vs 新 commit）
- 见证未初始化、不能重复初始化
- 非 agent 不能 consume、非 owner 不能 revoke
- receipt mismatch（action/amount）
- seal_policy 6 条 happy/fail 场景
- action-bound commit mismatch
- `next_commit == current commit` 与 `next_commit == empty`
- `period_ms = u64::MAX` 创建失败
- 多 bit `action` 在 Seal predicate 中失败
- `allowed_targets.length()`、`coin_limits.length()`、`metadata.length()` 上界
- `limit.period_spent + amount` 溢出路径返回业务错误而非 arithmetic abort
- V1 未实现 action 在 `create` 入口失败
- `amount == 0` 在 consume 与 Seal predicate 中失败
- revoked mandate 不能再 `update_expiry`
- oversized witness 在 consume 前失败

**仍未覆盖 / 仍需产品决策**：
1. PTB 端到端 fuzz / simulator。
2. owner 共同初始化或 Seal 签名验证的 F-5 后续方案。

---

## 4. 推荐整改优先级

### Phase A —— mainnet 阻断项（必须修）
- [x] **F-1** 加 `next_commit != current` 校验，并把 `next_commit` 与 action context/Seal blob id 绑定；只有重开协议决策后才改为确定性派生
- [ ] **F-2** `UpgradeCap` 转 multisig；mainnet 发布前 `only_additive_upgrades` 或 `make_immutable`
- [x] **F-3 + F-4** 把 `(mandate_id, action, target, amount, coin_type)` 绑进 commit / blob_id，闭合 Seal 逐动作授权语义

### Phase B —— 上线前硬化
- [ ] **F-5** `set_initial_witness` 改为 owner 共同初始化（或 Seal 公钥签名验证）
- [x] **F-6** `allowed_targets` 不能为空；或事件层打 "wildcard" 标记
- [x] **F-7** 给 `period_ms` / `allowed_targets.length` / `coin_limits.length` / `metadata.length` 加上界
- [x] **F-8** 加单 bit 断言

### Phase C —— 可观测性 & 维护性
- [ ] **F-9** 事件加 `witness_commit_before/after` 与 `nonce`
- [x] **F-10** `ACTION_MASK_ALL` 用位运算派生
- [x] **F-11 / N-1** V1 action mask 闸住 SEND/SWAP/PULL，预留 getter 保留给后续 phase

### Phase D —— 测试
- [x] 当前 Move 单测 39/39 PASS，覆盖本轮 N-1/N-2/N-3/N-4 硬化路径
- [ ] 引入 PTB 端到端 fuzz（Sui PTB simulator）

---

## 5. 后续协作建议

按 `~/.claude/rules/review-fix-roles.md` 的双引擎流程，推荐：

1. **codex-reviewer**：用 codex 对照本报告独立 review，补充我可能遗漏的"传统 Move"层面问题（acquires、phantom type 等本审计较少触及的角度）。
2. **claude-fixer**（xhigh）：按 Phase A → B → C 顺序落地修复，每个 Phase 一次 PR，附带 F-编号回引。
3. **codex accept** → 反向 **claude-reviewer** → **codex-fixer** → **claude accept**。

> 任何 Phase A 内的修复 **必须在 testnet 重新发布并跑完测试套件 + 一次新的双引擎审计** 后才能进入 mainnet。

---

*报告生成于 2026-05-14；下次再审建议节点：F-1/F-3 修复合并后、mainnet 发布前。*

---

## 6. 独立复审 Pass 2（Claude xhigh，2026-05-14 晚）

按 review-fix-roles 反向流程：本轮由 claude xhigh 独立扫描，复核 codex 已完成的 fixer 输出，并补充 sui-scanner 视角的遗漏。

### 6.1 复核状态

| # | 原结论 | 实测 | 状态 |
|---|---|---|---|
| F-1 | Fixed in source | `mandate.move:329` `assert!(next_commit != mandate.witness_commit, EInvalidCommit);` + `mandate.move:330-339` action-bound commit；test `consume_aborts_when_next_commit_reuses_current_commit` 覆盖 | ✅ Verified |
| F-2 | Open deployment task | UpgradeCap `0x7405...0db6` 仍为 `AddressOwner 0xc46c...7c49`（单 EOA），`policy = 0`（COMPATIBLE，最宽松）。**未做任何收紧。** | ⛔️ Still Open |
| F-3 | Fixed in source | `mandate.move:366-386` `derive_action_commit_for_type` 用 BCS 序列化 `ActionCommitMaterial { version, witness, mandate_id, action_type, target, coin_type, amount, next_commit }`，比"手工 concat"更安全（length-prefixed） | ✅ Verified |
| F-4 | Fixed in source | `seal_policy.move:22-32` 强制 `id == derive_approval_id(...)`，`derive_approval_id` 包含 `current_commit` | ✅ Verified |
| F-5 | Open protocol/product task | `mandate.move:220-233` `set_initial_witness` 仍由 agent 单方面写入，未引入 owner 共签或 Seal 签名校验 | ⛔️ Still Open |
| F-6 | Fixed in source | `mandate.move:152` `assert!(!allowed_targets.is_empty(), ENoAllowedTargets);` | ✅ Verified |
| F-7 | Fixed in source | `mandate.move:21-28` 全部上界；`mandate.move:255` `update_expiry` 加 `EExpiryTooFar`；`limit_check_and_consume` 重写为先减后比，无加法溢出 | ✅ Verified |
| F-8 | Fixed in source | `mandate.move:270-274` `assert_action_allowed` + `seal_policy.move:58` 都要求 single-bit；`is_single_action` 用 `action & (action-1) == 0` 而非 `count_ones`，符合 codex 复核建议 | ✅ Verified |
| F-9 | Open observability | `payment.move:25-32` `WitnessConsumed` 事件仍无 `nonce / witness_commit_before / witness_commit_after` | ⛔️ Still Open |
| F-10 | Fixed in source | `mandate.move:16-19` `ACTION_MASK_ALL` 由位运算派生，`ACTION_MASK_V1` 独立定义 | ✅ Verified |
| F-11 | Fixed in source | `mandate.move:149` `(actions & ACTION_MASK_V1) == actions`；`seal_policy.move:59` `is_v1_action`；`action_registry.move:111` 未知 action abort | ✅ Verified |

**测试 / 构建实测**：
- `sui move test`：**47 / 47 PASS**（原报告写 39/39；本轮版本团队又补了 8 条用例，新覆盖 witness-too-long、period overflow、unimplemented action 等路径）。
- `sui move build`：PASS（隐含于测试运行）。

### 6.2 复审角度（sui-scanner）逐项核查

| 维度 | 现状 | 评估 |
|---|---|---|
| Object classification | `Mandate{key}` 无 `store`，避免 wrap/public_transfer；`WitnessReceipt` 无任何 ability，真热土豆；`CoinLimit{store,drop,copy}` 嵌入 `Mandate` 字段；无 `AdminCap`、无 `init`、无 OTW | ✅ 设计合理 |
| Access control | 所有特权函数（`set_initial_witness`/`revoke`/`update_expiry`/`consume_witness`）均做 `ctx.sender()` 检查；package-scope 函数仅 `levo_agent::*` 可调；`unpack_for_action` 是 `public(package)` 且只在同 PTB 内由 `authorize_*` 消费 | ✅ |
| Dynamic field | 未使用 `dynamic_field` / `dynamic_object_field` | ✅ N/A |
| Lifecycle | `Mandate` 无 destroy 路径；过期/撤销后对象仍在链上 | ⚠️ 见 N-2 |
| UpgradeCap | `policy = 0`（COMPATIBLE），单 EOA 持有 | ⛔️ F-2 |
| OTW | 无 init / 无 OTW 需求 | ✅ N/A |
| Transfer policy | `Mandate` 通过 `share()` 共享，无 NFT/royalty 场景 | ✅ N/A |
| Math / overflow | `period_ms <= MAX_PERIOD_MS` + `period_cap - period_spent` 先校验后减，无加法溢出；`update_expiry` 的 `new_expiry_ms - now <= MAX_PERIOD_MS` 需要 `new_expiry_ms > now`（已 assert）保证不下溢 | ✅ |
| Hot potato | `WitnessReceipt` 必须在同 PTB 内由 `authorize_*` 消费；`unpack_for_action` 严格比对 5 元组 | ✅ |
| BCS canonicalization | `ActionCommitMaterial` / `ApprovalIdentityMaterial` 都带 `version: u8 = 1` 前缀，独立 struct 类型 → 不同 BCS 序列化空间，跨域无碰撞 | ✅ |
| Witness chain integrity | F-1+F-3+F-4 合力闭合：Seal blob id 绑 `current_commit`，witness preimage 绑 `(action, target, coin_type, amount, next_commit)`，`next_commit ≠ current_commit` 强制推进 | ✅ |
| Race conditions | Mandate 是 shared，多 tx 由 Sui 共识排序；revoke 与 consume_witness 串行；过期 / revoke 后 Seal `check` 返回 false → 委员会不释放 witness | ✅ |

### 6.3 本轮新增/补充观察

| # | 严重度 | 类型 | 摘要 |
|---|---|---|---|
| N-1 | INFORMATIONAL | 架构边界 | `WitnessReceipt` 消费**完全脱离链上 coin 流**——`authorize_*` 仅 `event::emit`，无返回值、无后续 capability，且整库无任何 Move 模块（含 `packages/levo-usd`）持有/移动 `Coin<C>` 的路径会接收 receipt 或在 PTB 里要求 `WitnessConsumed` 事件。当前 `apps/web/lib/stable-layer-earn.ts` 是 Privy 代签的用户路径，与 mandate 系统**无任何耦合**。结论：V1 上线时 mandate 是"agent 自证审计层"而非"资金强制鉴权层"。建议 Phase B 之前明确：要么在 `levo-agent` 增加 vault 模块、要么文档化"V1 MVP 阶段 mandate 仅作可观测限额声明，资金移动靠 agent 端可信执行" |
| N-2 | LOW | 生命周期 | `Mandate` 无销毁路径（只有 `destroy_for_testing`）。过期/撤销后对象常驻链上，owner 无法回收 storage rebate。**建议**：增加 `public fun destroy_expired(mandate: Mandate, clock: &Clock, ctx: &TxContext)`，要求 `sender == owner` 且 (`revoked` 或 `now >= expiry_ms`) |
| N-3 | LOW | 配置一致性 | `mandate::create` 对 `expiry_ms` 无上界，但 `update_expiry` 强制 `new_expiry_ms - now <= MAX_PERIOD_MS`。owner 可在创建时设置 100 年过期，却不能 update 超过 1 年。**建议**：`create` 加 `assert!(expiry_ms - now <= MAX_PERIOD_MS, EExpiryTooFar);` 对齐 |
| N-4 | LOW | 配置语义 | `CoinLimit` 允许 `per_tx_cap > period_cap`、`per_tx_cap = 0`、`period_cap = 0` 等退化配置。功能仍然安全（`limit_check_and_consume` 内的减法/不等式正确处理），但容易给 mandate 创建端写出"看似生效实际无法消费"的限额。**建议**（可选硬化）：`create` 中加 `assert!(per_tx_cap > 0 && period_cap > 0 && per_tx_cap <= period_cap, EInvalidCoinLimit);` |
| N-5 | INFORMATIONAL | 代码冗余 | `seal_policy::check` 中 `if (proposed_next_commit.is_empty())` 与下一行 `if (!mandate::valid_commit_len(&proposed_next_commit))` 语义重叠；`is_single_action` 也被 `is_v1_action` 内部再调一次。无功能影响，可清理 |
| N-6 | INFORMATIONAL | 复核校正 | 原报告"修复后 39/39 PASS"实际为 47/47（团队在审计后补加 8 条），覆盖面优于报告所述 |

> N-1 是本轮唯一接近 MEDIUM 的发现，但其严重度取决于**未来如何接入 StableLayer / Vault**，并非 `packages/levo-agent` 自身的漏洞。可在 mainnet 发布前以 spec 形式定义清楚边界即可。

### 6.4 修订后的 mainnet gating 清单

按本轮复核重排：

**MUST FIX before mainnet**：
1. **F-2** UpgradeCap 转 multisig（或至少调到 `only_additive_upgrades`）。当前 `policy = 0` 的 EOA 任意 upgrade 是单点 risk-of-ruin。
2. **F-5** `set_initial_witness` 改为 owner 共签或引入 Seal BLS 验签——否则 KMS 在 init 之前泄漏即可一次性架空 Seal MPC 层。
3. **N-1** Vault / coin-flow 边界必须文档化或落地：当前 mandate 在 V1 还是"软声明"，必须让产品/运营/法务确认接受这个 V1 取舍。

**SHOULD FIX before mainnet**：
4. **F-9** `WitnessConsumed` 加 `witness_commit_before/after` + `nonce`，否则链下难做幂等 / 状态对账。

**NICE TO HAVE**：
5. **N-2 / N-3 / N-4** create/destroy/limit 配置硬化。
6. **N-5** seal_policy 代码瘦身。

### 6.5 双引擎流程现状

按 `~/.claude/rules/review-fix-roles.md`：

- [x] **codex-reviewer**（原报告作者）→ 11 个 finding
- [x] **claude-fixer**（已落地 F-1/F-3/F-4/F-6/F-7/F-8/F-10/F-11 + 新增 47 个测试）
- [x] **codex accept**（原报告 §0 codex 复核段已签字）
- [x] **claude-reviewer**（本节）→ 全部修复成立 + 1×INFORMATIONAL/4×LOW 补充
- [ ] **codex-fixer** → 处理 F-2/F-5/F-9/N-1（部署 + 协议决策，非纯源码修复）
- [ ] **claude accept** → 等待 F-2/F-5/F-9 落地后复核

**建议下一步**：把 N-1 / F-5 / F-2 提到产品决策清单，决定 mainnet 之前要不要把 vault 模块或 owner 共签写进 V1。F-9 / N-2 / N-3 / N-4 / N-5 可以直接进 codex-fixer。

*Pass 2 复审 2026-05-14 晚 Claude xhigh + Sui-scanner skill 完成。下次再审节点：F-2/F-5/N-1 决策落地后。*

---

## 7. 独立复审 Pass 3（Claude + /web3-audit-sui-scanner，2026-05-15）

按 `~/.claude/rules/review-fix-roles.md` 反向流程，用户在 codex-fixer 介入前再调一次独立 sui-scanner 视角复核 Pass 2 之后的源码与链上状态。本节只更新 reviewer 结论，不改源码。

### 7.1 复核基线

- 源码版本：`packages/levo-agent/sources/{mandate,payment,action_registry,seal_policy}.move`（未变更，Pass 2 之后无新 commit）
- 测试：`sui move test` **47/47 PASS**
- 链上：`sui client object` 实测 UpgradeCap `0x7405390c…0db6`
  - `owner`: `AddressOwner 0xc46c0372…7c49`（仍为单 EOA）
  - `policy`: `0`（COMPATIBLE，最宽松）
  - `version`: `1`（未发生新一轮 upgrade）

### 7.2 Pass 2 结论复核

| # | Pass 2 状态 | Pass 3 实测 |
|---|---|---|
| F-1 | Verified | `mandate.move:329` `assert!(next_commit != mandate.witness_commit, EInvalidCommit);` + `payment.move:55-62` 把 (action,target,coin,amount,next_commit) 透到 `rotate_witness` ✅ |
| F-2 | Still Open | 链上 owner/policy 未变 ⛔️ |
| F-3 | Verified | `ActionCommitMaterial` BCS 编码（version=1, length-prefixed vector）正确闭合 witness ↔ action context 绑定 ✅ |
| F-4 | Verified | `seal_policy.move:22-32` 强制 `id == derive_approval_id(...)`；`ApprovalIdentityMaterial` 与 `ActionCommitMaterial` 是不同 struct → BCS 编码空间隔离，无跨域碰撞 ✅ |
| F-5 | Still Open | `mandate.move:220-233` `set_initial_witness` 仍由 agent 单方面写入，commit 与 Seal 出处无任何链上证明 ⛔️ |
| F-6 | Verified | `create` line 152 + `assert_target_allowed` line 277 双重把关 ✅ |
| F-7 | Verified | `MAX_PERIOD_MS=31_536_000_000` (1 年)、`MAX_TARGETS=32`、`MAX_COIN_LIMITS=16`、`MAX_METADATA_ENTRIES=16`、`MAX_METADATA_KEY_LEN=64`、`MAX_METADATA_VALUE_LEN=256`、`MAX_WITNESS_LEN=256`、`MAX_COMMIT_LEN=256` 全部到位；`limit_check_and_consume` 重写后无加法溢出 ✅ |
| F-8 | Verified | `is_single_action(a)` 用 `a != 0 && (a & (a-1)) == 0`，`seal_policy::check` 与 `mandate::assert_action_allowed` 双侧拦截 ✅ |
| F-9 | Still Open | `payment.move:25-32` 事件结构未变，无 `nonce / commit_before / commit_after` ⛔️ |
| F-10 | Verified | `ACTION_MASK_ALL` 与 `ACTION_MASK_V1` 均由位或派生 ✅ |
| F-11 | Verified | `create` line 149 + `assert_action_allowed` line 272 + `seal_policy::check` line 59 + `authorize_for_action` 未知分支 abort，四道闸 ✅ |
| N-1 | Still Open | `WitnessReceipt` 在仓库内无任何 vault/coin 模块消费，纯审计声明语义未变 ⛔️ |
| N-2 | Still Open | `Mandate` 仍无生产环境 destroy 路径 ⛔️ |
| N-3 | Still Open | `mandate::create` 对 `expiry_ms` 仍无上界，与 `update_expiry` 不一致 ⛔️ |
| N-4 | Still Open | `CoinLimit` 仍允许 `per_tx_cap=0`/`period_cap=0`/`per_tx_cap > period_cap` 等退化配置 ⛔️ |
| N-5 | Still Open | `seal_policy::check` 仍重复调用 `is_single_action` + `is_v1_action`、`is_empty()` + `valid_commit_len` ⛔️ |

→ **没有 regression**，Pass 2 的"已修复"项全部经独立路径再验。

### 7.3 Pass 3 新增观察（sui-scanner 独立视角）

| # | 严重度 | 类型 | 摘要 |
|---|---|---|---|
| P3-1 | LOW | 测试覆盖 | `set_initial_witness` 缺三条边界测试：(a) 非 agent 调用 → `ENotAgent`；(b) 空 commit → `EInvalidCommit`；(c) `commit.length() > MAX_COMMIT_LEN` → `ECommitTooLong`。当前已覆盖 already-init / revoked / expired，但访问控制与长度校验路径无显式断言。建议在 `mandate_tests.move` 补 3 条 expected_failure 用例 |
| P3-2 | LOW | 可观测性 | `set_initial_witness` 与 `rotate_witness` 都 emit 同一个 `WitnessRotated { mandate_id, new_commit }`。链下要区分"首次初始化"与"后续轮换"必须读取前一笔 tx 状态。**建议**与 F-9 一起做：要么拆 `WitnessInitialized` 事件，要么在 `WitnessRotated` 加 `previous_commit: vector<u8>` 字段（empty = init）|
| P3-3 | INFORMATIONAL | 代码注释 | `ActionCommitMaterial` (mandate.move:61-70) 与 `ApprovalIdentityMaterial` (mandate.move:72-81) 是 Seal 协议层的链上承诺，字段顺序/集合/`version` 直接决定 Seal MPC 委员会的 off-chain 计算。当前无注释提示。**建议**在两个 struct 上方各加一段注释，明确"任何字段变更必须先 bump `HASH_MATERIAL_VERSION_V1` 并同步 Seal SDK"|
| P3-4 | INFORMATIONAL | 类型约束 | `consume_witness<C>` / `coin_limit_mut<C>` / `authorize_*<C>` 的类型参数 `<C>` 无任何 ability 约束（既不要求 `drop` 也不要求 `store`）。意图上 `C` 是某个 Coin 类型，但 Move 端纯当 TypeName 标签使用。已在 N-1 文档化"V1 mandate 与资金流脱耦"。**建议**：在文档/注释里写明 `<C>` 是"逻辑 coin tag"，不是 `Coin<C>` 断言；或为未来加 vault 模块时把 `<C: drop>` 写上以自文档 |
| P3-5 | INFORMATIONAL | 配置一致性 | `Move.toml` 没有显式声明 `[dependencies]`，依赖默认 toolchain 的 Sui framework。`Move.lock` 记录了具体 toolchain 版本（1.70.1）。对长期可重现构建有轻微风险，但 Sui 生态常见做法，可不动 |
| P3-6 | INFORMATIONAL | 流程 | 当前 `share` 是独立 `public fun`，与 `create` 解耦。理论上 owner 可以 create 后不 share → mandate 卡死（不是安全问题，是 UX footgun）。Sui PTB 通常会 create + share 链式调用，因此前端只要按设计走就不会触发。**不建议**改为 `create_and_share`，因为现在的解耦允许同 PTB 做 `create → set_initial_witness → share`（虽然当前 `set_initial_witness` 要求 sender=agent，所以这条 PTB 路径不通；但保留灵活性总比硬合并好）|

→ 所有 Pass 3 新增项严重度 ≤ LOW，无新的 CRITICAL/HIGH。整体源码 Pass 1+Pass 2 修复后的 Sui 安全态势已稳定。

### 7.4 修订后的 mainnet gating 清单（Pass 3 复议）

与 Pass 2 §6.4 一致，本轮无追加 must-fix。

**MUST FIX before mainnet**（不可绕过）：
1. **F-2** UpgradeCap 转 multisig；至少调到 `only_additive_upgrades`
2. **F-5** `set_initial_witness` 改为 owner 共签或 Seal BLS 验签
3. **N-1** Vault / coin-flow 边界在产品 spec 中显式落定（"V1 mandate 是声明层而非强制层"）

**SHOULD FIX before mainnet**：
4. **F-9 + P3-2** `WitnessConsumed` / `WitnessRotated` 加 nonce + commit_before/after，区分 init/rotate

**NICE TO HAVE**：
5. **N-2 / N-3 / N-4** create/destroy/limit 配置硬化
6. **N-5 + P3-3** seal_policy 瘦身 + 在两个 hash material struct 加协议注释
7. **P3-1** 补 `set_initial_witness` 边界测试 3 条

### 7.5 双引擎流程现状（Pass 3 更新）

- [x] **codex-reviewer**（Pass 1）→ 11 个 finding
- [x] **claude-fixer**（Pass 1 → Pass 2）→ F-1/F-3/F-4/F-6/F-7/F-8/F-10/F-11 全部落地 + 47 测试
- [x] **codex accept**（Pass 1 末尾）
- [x] **claude-reviewer**（Pass 2 §6）→ 验证 + 4×LOW 补充
- [x] **claude-reviewer**（本节 Pass 3）→ 再次独立 sui-scanner 验证，无 regression + 6 项新观察（均 ≤ LOW）
- [ ] **codex-fixer** → 处理 F-2/F-5/F-9 + 可选 N-2/N-3/N-4/N-5/P3-1/P3-2/P3-3
- [ ] **claude accept** → F-2/F-5/F-9 落地 + N-1 产品决策完成后复核

**建议下一步**：
- F-2 是纯部署动作（一次 Sui CLI 调用），可即时处理：`sui client transfer --to <multisig> --object-id 0x7405...0db6` + `sui client call --function only_additive_upgrades` 收紧 policy。
- F-5 + N-1 需要产品/协议侧决策（要不要把 owner 共签放进 V1、要不要在 levo-agent 加 vault 模块强制资金流），不进 codex-fixer。
- F-9 + P3-1 + P3-2 是纯源码硬化，可一并进 codex-fixer。

*Pass 3 复审 2026-05-15 完成（Claude + `/web3-audit-sui-scanner` skill）。下次再审节点：F-2/F-5 落地后、mainnet 发布前。*

---

## 8. 修复轮次 Pass 4（Claude-fixer + `/sui-move-best-practices`，2026-05-15）

按 `~/.claude/rules/review-fix-roles.md` claude-fixer 角色，落实 Pass 3 §7.4 的"MUST FIX / SHOULD FIX / NICE TO HAVE"项中所有纯源码可修复的内容。

### 8.1 用户决策（本轮采用）

| 项 | 决策 | 备注 |
|---|---|---|
| F-5 | **Owner-only init** | `set_initial_witness` sender 校验改为 `mandate.owner`。UX：owner 多签一次 setup tx。最简方案，无新结构字段 |
| N-1 | **V1 = 纯审计层** | 不在本包加 vault 模块。本节最末显式落定边界，phase B 再扩 |
| F-2 | **本轮只更新源码 + 文档化 CLI** | UpgradeCap 暂留发布合约地址 `0xc46c…7c49`。下方给出 mainnet 前必须执行的 CLI 命令清单 |

### 8.2 本轮源码变更

| # | 类别 | 文件 | 变更 |
|---|---|---|---|
| F-5 | CRITICAL | `mandate.move` | `set_initial_witness` 改为 sender == owner；移除现已无用的 `ENotAgent` 常量；加注释说明 F-5 闭合点 |
| F-9 + P3-2 | SHOULD | `mandate.move` + `payment.move` | `Mandate` 加 `nonce: u64` 字段（init=1，rotate +1）；`WitnessRotated` 加 `previous_commit` + `nonce`；`WitnessConsumed` 加 `nonce` + `witness_commit_before` + `witness_commit_after`；加 `nonce()` getter |
| N-2 | NICE | `mandate.move` | 新增 `destroy_terminated(mandate, clock, ctx)`：owner 可在 revoked 或 expired 后销毁 mandate 回收 storage rebate；emit `MandateDestroyed` |
| N-3 | NICE | `mandate.move` | `create` 加 `assert!(expiry_ms - now <= MAX_PERIOD_MS, EExpiryTooFar)`，与 `update_expiry` 对齐 |
| N-4 | NICE | `mandate.move` | `create` 对每条 CoinLimit 加 `assert!(per_tx > 0 && period > 0 && per_tx <= period, EInvalidCoinLimit)` |
| N-5 | NICE | `seal_policy.move` | 移除 `is_single_action`（被 `is_v1_action` 包含）与 `proposed_next_commit.is_empty()`（被 `valid_commit_len` 包含）两条冗余分支 |
| P3-3 | INFO | `mandate.move` | 在 `ActionCommitMaterial` 与 `ApprovalIdentityMaterial` 上方加 "SEAL PROTOCOL COMMITMENT" 注释段，强调字段变更必须 bump `HASH_MATERIAL_VERSION_V1` 并同步 Seal SDK |

### 8.3 测试变更

**新增测试** (12 条)：
- P3-1：`set_initial_witness_aborts_when_not_owner` / `_with_empty_commit` / `_with_oversized_commit`
- N-2：`destroy_terminated_after_revoke` / `destroy_terminated_after_expiry` / `destroy_aborts_when_active` / `destroy_aborts_when_not_owner`
- N-3：`create_aborts_when_expiry_too_far`
- N-4：`create_aborts_with_zero_per_tx_cap` / `create_aborts_with_zero_period_cap` / `create_aborts_when_per_tx_exceeds_period`
- F-9 / P3-2：`nonce_increments_on_init_and_rotate`

**已有测试调整**：
- `init_witness` helper 由 `AGENT` 上下文改为 `OWNER`，自动覆盖所有调用方
- `cannot_re_initialize_witness` / `set_initial_witness_aborts_when_revoked` / `set_initial_witness_aborts_when_expired` 显式 `next_tx(AGENT)` 改为 `next_tx(OWNER)`
- 常量 `EXPIRY` 由 `1_000_000_000_000` 改为 `31_536_000_000`（MAX_PERIOD_MS），以适配 N-3 新加的 expiry 上界

**实测结果**：
```
sui move test → 59/59 PASS  (Pass 2 基线 47 → +12 本轮)
sui move build → 干净，无 warning
```

### 8.4 仍待处理（本轮未落地）

| # | 项 | 状态 | 后续动作 |
|---|---|---|---|
| F-2 | v2 UpgradeCap `0xb310…1c9c` 仍在 EOA `0xc46c…7c49`，policy=0 | **未动**（用户决策："本轮只更新源码 + 文档化 CLI"）| mainnet 前必须执行 §8.6 CLI 命令清单 |
| F-2-legacy | v1 UpgradeCap `0x7405…0db6` 也仍在 EOA，policy=0，包已被 v2 替代但 cap 还在生效 | **未动** | 建议 `make_immutable` 锁死 v1 cap（不影响 v2），消除 COMPATIBLE 单点风险 |
| N-1 | Vault / coin-flow 边界 | **本节 §8.7 显式落定** | V1 = 审计声明层；phase B 再扩 vault |

### 8.5 Breaking change 提示（部署相关）

`Mandate` 结构新增 `nonce: u64` 字段是 **breaking struct change**。Sui Move upgrade 不允许给已有 struct 加字段，因此：

- 当前 testnet 部署 (`0xd154d5…d8d1b` v1) **不可通过 upgrade 升级到本轮源码**。
- 需要执行一次 **新 package publish**（产生新的 PackageID 与 UpgradeCap）。
- Memory `levo-agent-published-ids` 与 `Published.toml` 必须在新 publish 后同步更新。
- 旧 testnet 上若有任何 v1 `Mandate` 对象，将与新代码不兼容（owner 需手动 revoke + destroy_for_testing 清理；或在前端 dashboard 标记为"legacy v1"）。

> 由于 v1 是 audit-前 baseline，记忆中已明示 "testnet 仍是修复前 v1"，redeploy 是预期路径。新 deploy 同时正好把 UpgradeCap policy 一并收紧。

### 8.6 F-2 处理 CLI 清单（mainnet 前必跑）

**Current state（2026-05-15 testnet redeploy 后）**：

| Cap | Package | Owner | Policy | 处置 |
|---|---|---|---|---|
| v2 UpgradeCap `0xb310849ebe97dbe8d9f2e4d5ae06d5985340f2b5ba54a105821b8a6e40c51c9c` | v2 `0x17546269…3e1c` (current) | `0xc46c0372…7c49` (deployer EOA) | 0 (COMPATIBLE) | mainnet 前必须收紧 + 转 multisig |
| v1 UpgradeCap `0x7405390c5cb00c654aac5902189feb7fa599815894959e2261fc729cdbd90db6` | v1 `0xd154d5…d8d1b` (orphaned) | `0xc46c0372…7c49` (deployer EOA) | 0 (COMPATIBLE) | 建议立即 `make_immutable` 锁死，消除 v1 残留升级面 |

**推荐步骤（待用户取得 multisig 地址后执行）**：

```bash
# === v1 (orphaned, do first to neutralize legacy attack surface) ===
# 永久锁死 v1 — v1 已被 v2 替代，无需再升级
sui client call \
  --package 0x0000000000000000000000000000000000000000000000000000000000000002 \
  --module package \
  --function make_immutable \
  --args 0x7405390c5cb00c654aac5902189feb7fa599815894959e2261fc729cdbd90db6 \
  --gas-budget 10000000

# === v2 (current, do before mainnet) ===
# 1) 收紧 policy 到 additive (只能新增模块/函数，不能改已有函数体)
sui client call \
  --package 0x0000000000000000000000000000000000000000000000000000000000000002 \
  --module package \
  --function only_additive_upgrades \
  --args 0xb310849ebe97dbe8d9f2e4d5ae06d5985340f2b5ba54a105821b8a6e40c51c9c \
  --gas-budget 10000000

# 2) （可选，更激进）进一步收紧到 dep_only (只能改依赖)
# sui client call --package 0x2 --module package --function only_dep_upgrades \
#   --args 0xb310849ebe97dbe8d9f2e4d5ae06d5985340f2b5ba54a105821b8a6e40c51c9c

# 3) 转给 multisig (替换 <MULTISIG_ADDRESS>)
sui client transfer \
  --to <MULTISIG_ADDRESS> \
  --object-id 0xb310849ebe97dbe8d9f2e4d5ae06d5985340f2b5ba54a105821b8a6e40c51c9c \
  --gas-budget 10000000

# 4) (V1 业务稳定后) 让 v2 包永久不可升级
# sui client call --package 0x2 --module package --function make_immutable \
#   --args 0xb310849ebe97dbe8d9f2e4d5ae06d5985340f2b5ba54a105821b8a6e40c51c9c
```

**用户当前决策（2026-05-15）**：本轮只更新源码 + 文档化命令，**v1/v2 两个 UpgradeCap 暂留发布合约地址**，CLI 由用户拿到 multisig 地址后再手动执行。

### 8.7 N-1 V1 边界声明

**Levo Agent V1 MVP 是"审计声明层"，不是"资金强制层"。**

- `WitnessReceipt` / `consume_witness` 仅记录 agent 在 mandate 限额内做出了哪些动作（事件 + nonce 链），**不强制托管或路由真实 `Coin<C>`**。
- 真实资金流（StableLayer earn deposit/withdraw/harvest）由 Privy 代签 + agent 端可信执行兜底；mandate 与该流程**无 Move-level 耦合**。
- 这意味着：
  - 攻击面分两层：agent KMS 私钥 + Privy server-sign 路径。一方泄漏不会因 mandate 自动放过另一方，但 mandate 也不会单方阻断另一方。
  - 用户层文案 / 产品 dashboard **必须明示**："本期 agent 行为有链上审计记录，但资金移动安全性以 agent 服务端为准"。
- Phase B 选项：在 `levo-agent` 内增加 `vault::deposit<C> / withdraw<C>` 模块，把 Coin 流接进 `WitnessReceipt` 强校验，把 mandate 从审计层升级为强制层。决策点：vault 与 StableLayer 的具体集成方式（直接调用 vs. 适配器层）。

### 8.8 双引擎流程现状（Pass 4 后）

- [x] codex-reviewer (Pass 1) — 11 findings
- [x] claude-fixer (Pass 1→2) — F-1/F-3/F-4/F-6/F-7/F-8/F-10/F-11 + 47 tests
- [x] codex accept (Pass 1)
- [x] claude-reviewer (Pass 2) — 4 LOW + 1 INFO 补充
- [x] claude-reviewer (Pass 3) — 6 项 ≤ LOW 补充，确认无 regression
- [x] **claude-fixer (Pass 4，本节)** — F-5 + F-9 + P3-2 + N-2 + N-3 + N-4 + N-5 + P3-1 + P3-3 + 12 new tests，59/59 PASS
- [ ] **codex accept (Pass 4)** — 等 codex 复核本轮源码改动
- [ ] **F-2 部署 + N-1 产品决策落地** — UpgradeCap 转 multisig（多签地址 TBD）+ V1 audit-only 边界经产品/法务确认
- [ ] **claude accept (Final)** — 上述全部完成 + testnet 重发新 package + 更新 `Published.toml` + memory 后再做一次完整复核

### 8.9 mainnet 发布前最终 checklist

| 必做 | 备注 |
|---|---|
| Pass 4 源码 codex accept | 等 codex 反向复核本轮 8 项修复 |
| testnet redeploy 新 package | 因 nonce breaking struct change |
| 更新 `Published.toml` + `levo_agent_published_ids.md` memory | 新 PackageID/UpgradeCap |
| 在新 UpgradeCap 上执行 §8.6 步骤 1 + 步骤 3 | 收紧 policy + 转 multisig |
| 产品/法务签字 N-1 V1 边界声明 (§8.7) | 用户文案同步 |
| 跑端到端 PTB 测试（Sui PTB simulator + Seal testnet 集成）| 链上链下闭环 |
| 完整 claude+codex Pass 5 复审 | mainnet gating |

*Pass 4 修复轮 2026-05-15 完成（Claude-fixer + `/sui-move-best-practices` skill）。下次节点：等 codex accept + redeploy。*

---

## 9. Testnet Redeploy（Pass 4 后续动作，2026-05-15）

按 §8.5 提示的 breaking struct change，本轮 Pass 4 源码改完后立即在 testnet 执行新 publish（**不是 upgrade**），确保 v2 IDs 落地后立刻可被后端/前端引用。

### 9.1 操作

- 删除 `Published.toml` 中的 v1 `[published.testnet]` 块（Sui CLI 检测到已发布会拒绝再发）
- `sui client publish --gas-budget 500000000`（active env: testnet, sender: deployer `0xc46c…7c49`）
- Sui 自动写回新的 `[published.testnet]` 块到 `Published.toml`（v1 历史 IDs 转移到 §9.2 表 + memory `levo_agent_published_ids` 留存）

### 9.2 New IDs (v2)

| 角色 | ID |
|---|---|
| PackageID (v2, current) | `0x17546269c14c25aa9223a063f11abb2167284a0ffa2dc5c6b9ea740dfe613e1c` |
| UpgradeCap (v2) | `0xb310849ebe97dbe8d9f2e4d5ae06d5985340f2b5ba54a105821b8a6e40c51c9c` (owner: `0xc46c…7c49`, policy=0) |
| Publish tx | `7EUCcEQTk6tUxrJ1NuT248SnwWrCWnLzm3kaFNWyVobg` |
| Modules | `mandate`, `payment`, `action_registry`, `seal_policy` |
| Gas used | 77,724,280 MIST (~0.078 SUI) |

### 9.3 v1 (legacy) 状态

| 角色 | ID | 状态 |
|---|---|---|
| PackageID (v1, orphaned) | `0xd154d516…d8d1b` | 仍在 testnet 上，但客户端不再引用；任何残留 v1 `Mandate` 对象与 v2 不兼容（结构 BCS 不同）|
| UpgradeCap (v1) | `0x7405390c…0db6` | 仍在 deployer EOA，policy=0；建议立即 `make_immutable` 关掉残留升级面（见 §8.6）|

### 9.4 后续 must-do

- [x] Memory `levo_agent_published_ids` 已更新为 v2 + 保留 v1 历史
- [ ] 前端 `apps/web/lib/agent/` 与 backend `/api/v1/agent/*` 引用的 PackageID/event shape 必须切到 v2
- [ ] Backend Seal SDK 调用必须按新的 `derive_action_commit` / `derive_approval_id` 输入（含 `nonce` 字段下的事件订阅）重新接入
- [ ] 端到端 PTB simulator 走通一次 happy path（create → owner set_initial_witness → agent consume_witness → authorize → revoke → destroy_terminated）

*Redeploy 2026-05-15 完成。下一步：codex accept Pass 4 源码后开始 mainnet gating 流程。*

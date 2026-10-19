// v3.4.0 纯增量：把设置页第一栏（"当前已配置…"那段）收进标题右侧的微型按钮气泡，
// 并把标题简化成"设置"、资源查找策略默认成全"全部来源"（第十二轮）。
// 基线的 #settingsState 一个字都不改：整块活节点搬进气泡，基线继续用
// dom.settingsState.innerHTML 写状态，气泡里看到的永远是最新内容；收起 = 一行 CSS 都不用删。
// 任何一环缺失（标题、状态块、卡片）就原样退回；这个文件与 CSS 里 cf4 那一段整体摘掉，
// 被搬走的 #settingsState 就会重新出现在设置面板滚动区顶部，基线形态一行没被动过。

const CARET_VAR = '--cf4-caret-x';
const GAP = 10;

// freeicon 的 autoprefixer / filled 就是 Autoprefixer 官方标章的实心版：
// 一个大写 A 的三角字形 + 左右两片小三角翼。路径按官方 mark 内联，不走外部请求。
const ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M5.87 21.045h2.923l.959-3.068h4.503l.949 3.068h2.922L11.94 2.955l-6.07 18.09zm6.162-10.12 1.543 4.917h-3.153l1.553-4.916h.057zM24 17.617l-.378-1.182-6.266-.59.733 2.127 5.91-.354zM6.644 15.843l-6.266.591L0 17.616l5.911.355.733-2.128z"/>
  </svg>
`;

function mountSettingsBubble() {
  const title = document.querySelector('#settingsTitle');
  const stateNode = document.querySelector('#settingsState');
  const card = document.querySelector('.settings-card');
  const modal = document.querySelector('#settingsModal');
  if (!title || !stateNode || !card || !modal) return false;
  if (title.dataset.cf4SettingsBubble === '1') return true;
  title.dataset.cf4SettingsBubble = '1';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cf4-config-btn';
  button.setAttribute('aria-label', '查看当前配置');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = ICON;
  title.append(button);

  const bubble = document.createElement('div');
  bubble.className = 'cf4-bubble';
  bubble.setAttribute('role', 'status');
  bubble.append(stateNode); // 移动而非克隆：基线的后续写入直接落在气泡里
  card.append(bubble);

  const isOpen = () => bubble.classList.contains('is-open');

  // 每次展开都按按钮实际位置重算：右缘尽量对齐按钮右缘，小箭头指着按钮中心；
  // 卡片是 overflow:hidden，所以先保证气泡本身不出界，箭头在气泡内左右让位
  const CARET_INSET = 16;
  const CARD_INSET = 24;
  function place() {
    const cardRect = card.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const width = bubble.offsetWidth;
    if (!cardRect.width || !buttonRect.width || !width) return;
    bubble.style.top = `${Math.round(titleRect.bottom - cardRect.top) + GAP}px`;
    const wanted = Math.round(cardRect.right - buttonRect.right);
    const maxRight = Math.max(0, Math.round(cardRect.width - CARD_INSET - width));
    const right = Math.min(wanted, maxRight);
    bubble.style.right = `${right}px`;
    const bubbleLeft = cardRect.right - right - width;
    const caret = buttonRect.left + buttonRect.width / 2 - bubbleLeft;
    bubble.style.setProperty(CARET_VAR, `${Math.round(Math.min(Math.max(caret, CARET_INSET), width - CARET_INSET))}px`);
  }

  function show() {
    place();
    bubble.classList.add('is-open');
    bubble.inert = false;
    button.setAttribute('aria-expanded', 'true');
  }

  function hide() {
    if (!isOpen()) return;
    bubble.classList.remove('is-open');
    bubble.inert = true;
    button.setAttribute('aria-expanded', 'false');
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isOpen()) hide();
    else show();
  });

  // 点气泡和按钮以外任何地方就收起（设置卡里的输入框、下拉也算外面）
  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.cf4-config-btn, .cf4-bubble')) return;
    hide();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });

  // 设置面板关闭后气泡也必须收起：否则下次打开时它是"开"的状态挡着输入框
  new MutationObserver(() => {
    if (modal.classList.contains('is-hidden')) hide();
  }).observe(modal, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('resize', () => {
    if (isOpen()) place();
  });

  bubble.inert = true;
  return true;
}

// 第十二轮：标题简化为"设置"，资源查找策略不再让用户挑——默认"全部来源"（内置 8 源 + 自定义源全参与轮询）。
// 换标题只改第一个文本节点：微型按钮是 append 进来的兄弟节点，不受影响。
function simplifySettings({ api, state } = {}) {
  const title = document.querySelector('#settingsTitle');
  if (title && title.dataset.cf5Title !== '1') {
    title.dataset.cf5Title = '1';
    const text = Array.from(title.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()
    );
    if (text) text.nodeValue = '设置';
  }
  // 策略持久化走基线现成的 app:saveResourceMode：写进 settings.json 之后，
  // 基线每轮资源轮询都从主进程拿回同一个值，不会被一次本地赋值悄悄覆盖回去。
  if (!api?.saveResourceMode || state?.resourceSettings?.mode === 'full') return;
  Promise.resolve(api.saveResourceMode('full'))
    .then((next) => {
      if (!next || !state) return;
      state.resourceSettings = { ...state.resourceSettings, ...next };
      if (state.credential) state.credential.resources = state.resourceSettings;
    })
    .catch(() => { /* 没改成就一直用基线默认档，其它功能不受影响 */ });
}

// 装配失败也只是设置页维持基线形态，绝不连带影响三页链路
export function initIncrementalSettings(deps = {}) {
  try {
    const mounted = mountSettingsBubble();
    simplifySettings(deps);
    return mounted;
  } catch (error) {
    console.warn('[CineFlow] 设置页配置气泡装配失败，已跳过', error);
    return false;
  }
}

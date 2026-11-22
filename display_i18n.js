'use strict';

/* ==========================================================================
   Bullion Pulse — Display Modes, 5 Designer Vault Themes, Multi-Language UI,
   Wide-Screen Split-Desk (1440px+), Ultrawide 3-Col Desk & OLED Pixel-Shift
   (#112, #121, #131, #179, #181)
   ========================================================================== */

(() => {
  const B = () => window.__BP_BRIDGE || null;

  /* ---------- #121 Designer Vault Themes ---------- */

  const VAULT_THEMES = [
    {
      id: 'dark',
      name: 'Classic Dark',
      desc: 'Balanced obsidian dark desk with warm gold accents',
      metaColor: '#0D0E11',
      swatches: ['#0D0E11', '#15171C', '#D4A843', '#22C55E'],
      light: false,
    },
    {
      id: 'oled',
      name: 'OLED Pitch Black',
      desc: 'True #000000 black background — saves OLED phone & monitor battery',
      metaColor: '#000000',
      swatches: ['#000000', '#090A0D', '#E8C15A', '#22C55E'],
      light: false,
    },
    {
      id: 'swiss-gold',
      name: 'Swiss Gold',
      desc: 'Warm Zurich espresso-black vault with brushed champagne gold',
      metaColor: '#0F0D09',
      swatches: ['#0F0D09', '#1A160F', '#F0CA67', '#34D399'],
      light: false,
    },
    {
      id: 'mint-silver',
      name: 'Mint Silver',
      desc: 'Cool arctic slate with crisp platinum & mint silver accents',
      metaColor: '#0A0F14',
      swatches: ['#0A0F14', '#121B24', '#5EEAD4', '#CBD5E1'],
      light: false,
    },
    {
      id: 'terminal-amber',
      name: 'Retro Terminal Amber',
      desc: 'Classic glowing amber-on-black CRT trading terminal display',
      metaColor: '#090704',
      swatches: ['#090704', '#141008', '#FFB000', '#FFD166'],
      light: false,
    },
    {
      id: 'daylight-paper',
      name: 'Daylight Paper',
      desc: 'Warm high-contrast ivory broadsheet made for bright sunlight',
      metaColor: '#FBF8F1',
      swatches: ['#FBF8F1', '#F2ECE0', '#9A6B12', '#0F6A3B'],
      light: true,
    },
    {
      id: 'light',
      name: 'Classic Light',
      desc: 'Clean soft cream finish for daytime reading',
      metaColor: '#F6F4EF',
      swatches: ['#F6F4EF', '#FFFFFF', '#A77B16', '#15803D'],
      light: true,
    },
  ];

  const THEME_MAP = Object.fromEntries(VAULT_THEMES.map((t) => [t.id, t]));

  /* ---------- #112 Multi-Language Plain-Language Switcher (7 Languages) ---------- */

  const LANGUAGES = [
    { code: 'en', short: 'EN', native: 'English', label: 'EN · English' },
    { code: 'th', short: 'ไทย', native: 'ไทย', label: 'ไทย · Thai' },
    { code: 'lo', short: 'ລາວ', native: 'ລາວ', label: 'ລາວ · Lao' },
    { code: 'es', short: 'ES', native: 'Español', label: 'ES · Español' },
    { code: 'zh', short: '中文', native: '中文', label: '中文 · Chinese' },
    { code: 'ja', short: '日本語', native: '日本語', label: '日本語 · Japanese' },
    { code: 'hi', short: 'हिन्दी', native: 'हिन्दी', label: 'हिन्दी · Hindi' },
  ];

  // Exact plain-English -> 6 target languages dictionary (pure textContent only; 'en' restores original)
  const PHRASES = {
    // Primary navigation & header
    'Markets': { th: 'ตลาด', lo: 'ຕະຫຼາດ', es: 'Mercados', zh: '市场', ja: '市場', hi: 'बाज़ार' },
    'Outlook': { th: 'แนวโน้ม', lo: 'ແນວໂນ້ມ', es: 'Pronóstico', zh: '展望', ja: '見通し', hi: 'अनुमान' },
    'Trade': { th: 'ซื้อขาย', lo: 'ຊື້ຂາຍ', es: 'Operar', zh: '交易', ja: '取引', hi: 'व्यापार' },
    'Stack': { th: 'คลังของฉัน', lo: 'ຄັງຂອງຂ້ອຍ', es: 'Mi Reserva', zh: '我的持仓', ja: '保有資産', hi: 'मेरा भंडार' },
    '← Back': { th: '← กลับ', lo: '← ກັບຄືນ', es: '← Volver', zh: '← 返回', ja: '← 戻る', hi: '← वापस' },

    // Main section labels
    'Live Gold & Silver Prices': {
      th: 'ราคาทองคำและเงินสด',
      lo: 'ລາຄາຄຳ ແລະ ເງິນສົດ',
      es: 'Precios de Oro y Plata en Vivo',
      zh: '实时黄金与白银价格',
      ja: 'リアルタイム金・銀価格',
      hi: 'लाइव सोना और चांदी कीमतें',
    },
    'Gold & Silver Outlook': {
      th: 'แนวโน้มราคาทองคำและเงิน',
      lo: 'ແນວໂນ້ມລາຄາຄຳ ແລະ ເງິນ',
      es: 'Pronóstico de Oro y Plata',
      zh: '黄金与白银前景展望',
      ja: '金・銀の相場見通し',
      hi: 'सोना और चांदी का अनुमान',
    },
    'Price Forecast & Market Signals': {
      th: 'คาดการณ์ราคาและสัญญาณตลาด',
      lo: 'ຄາດຄະເນລາຄາ ແລະ ສັນຍານຕະຫຼາດ',
      es: 'Pronóstico y Señales de Mercado',
      zh: '价格预测与市场信号',
      ja: '価格予測・市場シグナル',
      hi: 'कीमत अनुमान और बाज़ार संकेत',
    },
    'Buy, Grade & Swap Tools': {
      th: 'เครื่องมือซื้อ เช็กราคา และสลับโลหะ',
      lo: 'ເຄື່ອງມືຊື້ ກວດລາຄາ ແລະ ແລກປ່ຽນ',
      es: 'Herramientas de Compra y Cambio',
      zh: '买入、验价与换仓工具',
      ja: '購入・査定・交換ツール',
      hi: 'खरीद, जांच और स्वैप टूल',
    },
    'What Moves It': { th: 'ปัจจัยขับเคลื่อน', lo: 'ປັດໄຈຂັບເຄື່ອນ', es: 'Qué Lo Mueve', zh: '涨跌动因', ja: '変動要因', hi: 'मुख्य कारण' },
    'Vaults & Miners': { th: 'คลังและเหมือง', lo: 'ຄັງ ແລະ ບໍ່ແຮ່', es: 'Bóvedas y Mineras', zh: '金库与矿企', ja: '金庫・鉱山', hi: 'वॉल्ट और खदानें' },
    'Odds & News': { th: 'โอกาสและข่าว', lo: 'ໂອກາດ ແລະ ຂ່າວ', es: 'Probabilidades y Noticias', zh: '概率与新闻', ja: '確率・ニュース', hi: 'संभावना और ख़बरें' },
    'Ratio & Swap': { th: 'อัตราส่วนและสลับ', lo: 'ອັດຕາສ່ວນ ແລະ ແລກ', es: 'Ratio y Cambio', zh: '金银比与换仓', ja: '比率・交換', hi: 'अनुपात और स्वैप' },
    'Buy-the-Dip': { th: 'แผนซื้อตอนย่อ', lo: 'ແຜນຊື້ຕອນລາຄາລົງ', es: 'Comprar en Caída', zh: '逢低分批买', ja: '押し目買い計画', hi: 'गिरावट पर खरीद' },
    'Deal Grader': { th: 'เช็กราคาดีล', lo: 'ກວດລາຄາດີລ', es: 'Evaluador de Ofertas', zh: '报价评分器', ja: '取引価格判定', hi: 'डील ग्रेडर' },
    '7-Day': { th: '7 วัน', lo: '7 ມື້', es: '7 Días', zh: '7天', ja: '7日間', hi: '7 दिन' },
    '30-Day': { th: '30 วัน', lo: '30 ມື້', es: '30 Días', zh: '30天', ja: '30日間', hi: '30 दिन' },
    'Key Levels': { th: 'แนวรับ-ต้าน', lo: 'ແນວຮັບ-ຕ້ານ', es: 'Niveles Clave', zh: '关键价位', ja: '重要水準', hi: 'मुख्य स्तर' },
    'Avg Trend': { th: 'เส้นค่าเฉลี่ย', lo: 'ເສັ້ນຄ່າສະເລ່ຍ', es: 'Tendencia Media', zh: '均线趋势', ja: '平均トレンド', hi: 'औसत रुझान' },
    'Momentum': { th: 'โมเมนตัม', lo: 'ໂມເມັນຕຳ', es: 'Impulso', zh: '动能指标', ja: '勢い', hi: 'गति' },
    '▶ Replay': { th: '▶ เล่นซ้ำ', lo: '▶ ຫຼິ້ນຊ້ຳ', es: '▶ Repetir', zh: '▶ 回放', ja: '▶ 再生', hi: '▶ रीप्ले' },
    'Price Odds Simulator': { th: 'จำลองโอกาสราคา', lo: 'ຈຳລອງໂອກາດລາຄາ', es: 'Simulador de Probabilidades', zh: '价格概率模拟器', ja: '価格確率シミュレーター', hi: 'कीमत संभावना सिमुलेटर' },
    'Smart Buy-the-Dip Ladder': { th: 'แผนทยอยซื้อตอนราคาย่อ', lo: 'ແຜນທະຍອຍຊື້ຕອນລາຄາລົງ', es: 'Escalera Inteligente de Compra', zh: '智能逢低分批买入梯队', ja: 'スマート押し目購入プラン', hi: 'स्मार्ट डिप-खरीद योजना' },
    'Daily Self-Check & Accuracy': { th: 'ตรวจความแม่นยำประจำวัน', lo: 'ກວດຄວາມແມ່ນຍຳປະຈຳວັນ', es: 'Autoevaluación y Precisión', zh: '每日自检与准确率', ja: '日次精度チェック', hi: 'दैनिक सटीकता जांच' },
    'Re-run': { th: 'จำลองใหม่', lo: 'ຈຳລອງໃໝ່', es: 'Re-ejecutar', zh: '重新模拟', ja: '再計算', hi: 'पुनः चलाएँ' },
    'Swap, Buy Plan & Deal Checker': {
      th: 'สลับทอง-เงิน แผนซื้อ และเช็กราคาร้าน',
      lo: 'ແລກຄຳ-ເງິນ ແຜນຊື້ ແລະ ກວດລາຄາຮ້ານ',
      es: 'Cambio, Plan de Compra y Ofertas',
      zh: '换仓、定投计划与验价器',
      ja: '交換・購入計画・価格チェック',
      hi: 'बदलें, खरीद योजना और डील जांच',
    },
    'My Gold & Silver Stack': {
      th: 'คลังทองคำและเงินของฉัน',
      lo: 'ຄັງຄຳ ແລະ ເງິນຂອງຂ້ອຍ',
      es: 'Mi Reserva de Oro y Plata',
      zh: '我的黄金与白银持仓',
      ja: '自分の金・銀コレクション',
      hi: 'मेरा सोना और चांदी भंडार',
    },
    'Settings & Alerts': {
      th: 'ตั้งค่าและการแจ้งเตือน',
      lo: 'ຕັ້ງຄ່າ ແລະ ການແຈ້ງເຕືອນ',
      es: 'Ajustes y Alertas',
      zh: '设置与提醒',
      ja: '設定とアラート',
      hi: 'सेटिंग्स और अलर्ट',
    },

    // Sub-tabs across all views
    'Live & Chart': { th: 'ราคาและกราฟ', lo: 'ລາຄາ ແລະ ກຣາຟ', es: 'En Vivo y Gráfico', zh: '实时与图表', ja: 'ライブ・チャート', hi: 'लाइव और चार्ट' },
    'Global & Maps': { th: 'ตลาดโลกและแผนที่', lo: 'ຕະຫຼາດໂລກ ແລະ ແຜນທີ່', es: 'Global y Mapas', zh: '全球与地图', ja: '世界・マップ', hi: 'वैश्विक और नक्शा' },
    'Deep Charts': { th: 'กราฟเชิงลึก', lo: 'ກຣາຟເຊິງເລິກ', es: 'Gráficos Avanzados', zh: '深度图表', ja: '詳細チャート', hi: 'विस्तृत चार्ट' },
    'More & Trust': { th: 'เพิ่มเติมและความน่าเชื่อถือ', lo: 'ເພີ່ມເຕີມ ແລະ ຄວາມໜ້າເຊື່ອຖື', es: 'Más y Confianza', zh: '更多与可信度', ja: 'その他・信頼性', hi: 'अधिक और भरोसा' },
    '7D & 30D Forecast': { th: 'คาดการณ์ 7 และ 30 วัน', lo: 'ຄາດຄະເນ 7 ແລະ 30 ມື້', es: 'Pronóstico 7D y 30D', zh: '7天与30天预测', ja: '7日・30日予測', hi: '7 और 30 दिन का अनुमान' },
    'Why It Moves': { th: 'ปัจจัยขับเคลื่อนราคา', lo: 'ສາເຫດທີ່ລາຄາຂຶ້ນລົງ', es: 'Por Qué Se Mueve', zh: '涨跌原因', ja: '価格が動く理由', hi: 'कीमत क्यों बदलती है' },
    'Banks & Vaults': { th: 'ธนาคารกลางและคลังทอง', lo: 'ທະນາຄານ ແລະ ຄັງຄຳ', es: 'Bancos y Bóvedas', zh: '央行与金库', ja: '銀行・保管庫', hi: 'बैंक और तिजोरी' },
    'Sim & Track Record': { th: 'จำลองและสถิติความแม่นยำ', lo: 'ຈຳລອງ ແລະ ສະຖິຕິ', es: 'Simulador e Historial', zh: '模拟与历史战绩', ja: '予測試算・実績', hi: 'सिमुलेटर और रिकॉर्ड' },
    'Gold ↔ Silver': { th: 'ทองคำ ↔ เงิน', lo: 'ຄຳ ↔ ເງິນ', es: 'Oro ↔ Plata', zh: '黄金 ↔ 白银', ja: '金 ↔ 銀', hi: 'सोना ↔ चांदी' },
    'Buy Plan': { th: 'แผนทยอยซื้อ', lo: 'ແຜນທະຍອຍຊື້', es: 'Plan de Compra', zh: '分批买入计划', ja: '購入プラン', hi: 'खरीद योजना' },
    'Deal Checker': { th: 'เช็กราคาซื้อ', lo: 'ກວດລາຄາຊື້', es: 'Verificador de Precio', zh: '报价检验器', ja: '価格チェッカー', hi: 'डील चेकर' },
    'Overview': { th: 'ภาพรวม', lo: 'ພາບລວມ', es: 'Resumen', zh: '总览', ja: '概要', hi: 'सारांश' },
    'Goals & What-If': { th: 'เป้าหมายและจำลองราคา', lo: 'ເປົ້າໝາຍ ແລະ ຈຳລອງ', es: 'Metas y Escenarios', zh: '目标与情景', ja: '目標・試算', hi: 'लक्ष्य और परिदृश्य' },
    'My Buys': { th: 'ประวัติการซื้อ', lo: 'ປະຫວັດການຊື້', es: 'Mis Compras', zh: '我的买入记录', ja: '購入履歴', hi: 'मेरी खरीद' },
    'Display': { th: 'ธีมและภาษา', lo: 'ທີມ ແລະ ພາສາ', es: 'Pantalla', zh: '显示与语言', ja: '表示・言語', hi: 'डिस्प्ले' },
    'Display & Lang': { th: 'ธีมและภาษา', lo: 'ທີມ ແລະ ພາສາ', es: 'Pantalla e Idioma', zh: '显示与语言', ja: '表示と言語', hi: 'डिस्प्ले और भाषा' },
    'Alert Rules': { th: 'กฎการแจ้งเตือน', lo: 'ກົດການແຈ້ງເຕືອນ', es: 'Reglas de Alerta', zh: '提醒规则', ja: 'アラート設定', hi: 'अलर्ट नियम' },
    'Phone & Log': { th: 'มือถือและประวัติ', lo: 'ມືຖື ແລະ ປະຫວັດ', es: 'Teléfono e Historial', zh: '手机推送与日志', ja: '通知と履歴', hi: 'फ़ोन और लॉग' },
    'Install': { th: 'ติดตั้ง', lo: 'ຕິດຕັ້ງ', es: 'Instalar', zh: '安装', ja: '導入', hi: 'इंस्टॉल' },
    'Install & 24/7': { th: 'ติดตั้งและแจ้งเตือน 24 ชม.', lo: 'ຕິດຕັ້ງ ແລະ ແຈ້ງເຕືອນ 24 ຊມ.', es: 'Instalar y 24/7', zh: '安装与24小时监控', ja: 'インストール・24時間', hi: 'इंस्टॉल और 24/7' },

    // Units, metals & common controls
    'Troy oz': { th: 'ออนซ์ (oz)', lo: 'ອອນສ໌ (oz)', es: 'Onza troy', zh: '金衡盎司', ja: 'トロイオンス', hi: 'ट्रॉय औंस' },
    'Gram': { th: 'กรัม (g)', lo: 'ກຣາມ (g)', es: 'Gramo', zh: '克', ja: 'グラム', hi: 'ग्राम' },
    'Gold Spot': { th: 'ราคาทองคำสด', lo: 'ລາຄາຄຳສົດ', es: 'Oro al Contado', zh: '现货黄金', ja: '金スポット', hi: 'सोना स्पॉट' },
    'Silver Spot': { th: 'ราคาเงินสด', lo: 'ລາຄາເງິນສົດ', es: 'Plata al Contado', zh: '现货白银', ja: '銀スポット', hi: 'चांदी स्पॉट' },
    'Gold': { th: 'ทองคำ', lo: 'ຄຳ', es: 'Oro', zh: '黄金', ja: '金', hi: 'सोना' },
    'Silver': { th: 'เงิน', lo: 'ເງິນ', es: 'Plata', zh: '白银', ja: '銀', hi: 'चांदी' },
    'Ratio': { th: 'อัตราส่วน', lo: 'ອັດຕາສ່ວນ', es: 'Ratio', zh: '金银比', ja: '比率', hi: 'अनुपात' },
    'Gold / Silver Ratio': { th: 'อัตราส่วนทองคำต่อเงิน', lo: 'ອັດຕາສ່ວນຄຳຕໍ່ເງິນ', es: 'Ratio Oro / Plata', zh: '金银比率', ja: '金銀比価', hi: 'सोना / चांदी अनुपात' },
    'Gold Futures': { th: 'ทองคำฟิวเจอร์ส', lo: 'ຄຳລ່ວງໜ້າ', es: 'Futuros de Oro', zh: '黄金期货', ja: '金先物', hi: 'सोना फ्यूचर्स' },
    'Silver Futures': { th: 'เงินฟิวเจอร์ส', lo: 'ເງິນລ່ວງໜ້າ', es: 'Futuros de Plata', zh: '白银期货', ja: '銀先物', hi: 'चांदी फ्यूचर्स' },
    "Today's High": { th: 'สูงสุดวันนี้', lo: 'ສູງສຸດມື້ນີ້', es: 'Máximo de Hoy', zh: '今日最高', ja: '本日高値', hi: 'आज का उच्चतम' },
    "Today's Low": { th: 'ต่ำสุดวันนี้', lo: 'ຕ່ຳສຸດມື້ນີ້', es: 'Mínimo de Hoy', zh: '今日最低', ja: '本日安値', hi: 'आज का न्यूनतम' },
    'Pure Melt': { th: 'ราคาเนื้อทองแท้', lo: 'ລາຄາເນື້ອຄຳແທ້', es: 'Valor Puro', zh: '纯金折算', ja: '地金純価', hi: 'शुद्ध मूल्य' },
    'Est. Shop': { th: 'ราคาหน้าร้านโดยประมาณ', lo: 'ລາຄາໜ້າຮ້ານໂດຍປະມານ', es: 'Tienda Est.', zh: '预计门店价', ja: '店頭目安', hi: 'अनुमानित दुकान' },

    // Major Panel Titles
    'World Physical Gold Board': {
      th: 'กระดานราคาทองคำทั่วโลก',
      lo: 'ກະດານລາຄາຄຳທົ່ວໂລກ',
      es: 'Tablero Mundial de Oro Físico',
      zh: '全球实物黄金价格看板',
      ja: '世界の実物ゴールド価格ボード',
      hi: 'विश्व भौतिक सोना बोर्ड',
    },
    'Live Global Vault World Map': {
      th: 'แผนที่ตลาดทองคำโลกแบบสด',
      lo: 'ແຜນທີ່ຕະຫຼາດຄຳໂລກແບບສົດ',
      es: 'Mapa Mundial de Mercados en Vivo',
      zh: '全球黄金市场实时地图',
      ja: '世界の金市場ライブマップ',
      hi: 'लाइव ग्लोबल गोल्ड वर्ल्ड मैप',
    },
    'Futures Prices & Supply Pressure': {
      th: 'ราคาฟิวเจอร์สและแรงตึงตัวของอุปทาน',
      lo: 'ລາຄາລ່ວງໜ້າ ແລະ ຄວາມຕຶງຕົວຂອງຄຳ',
      es: 'Futuros y Presión de Suministro',
      zh: '期货价格与实物供应压力',
      ja: '先物価格と供給ひっ迫度',
      hi: 'फ्यूचर्स कीमतें और आपूर्ति दबाव',
    },
    'China Physical Prices (Shanghai)': {
      th: 'ราคาทองคำและเงินจริงในจีน (เซี่ยงไฮ้)',
      lo: 'ລາຄາຄຳ ແລະ ເງິນຈິງໃນຈີນ (ຊຽງໄຮ້)',
      es: 'Precios Físicos en China (Shanghái)',
      zh: '中国实物金银价格（上海）',
      ja: '中国現物価格（上海）',
      hi: 'चीन भौतिक कीमतें (शंघाई)',
    },
    'My Gold & Silver Value': {
      th: 'มูลค่าทองคำและเงินของฉัน',
      lo: 'ມູນຄ່າຄຳ ແລະ ເງິນຂອງຂ້ອຍ',
      es: 'Valor de Mi Oro y Plata',
      zh: '我的黄金与白银总价值',
      ja: '保有金・銀の現在価値',
      hi: 'मेरे सोने और चांदी का मूल्य',
    },
    'Personal Stack Time Machine': {
      th: 'ไทม์แมชชีนมูลค่าคลังของฉัน',
      lo: 'ໄທມ໌ແມຊີນມູນຄ່າຄັງຂອງຂ້ອຍ',
      es: 'Máquina del Tiempo de Mi Reserva',
      zh: '个人持仓时光机',
      ja: '保有資産タイムマシン',
      hi: 'मेरा भंडार टाइम मशीन',
    },
    'Gold vs. Silver Breakdown': {
      th: 'สัดส่วนทองคำเทียบกับเงิน',
      lo: 'ສັດສ່ວນຄຳທຽບກັບເງິນ',
      es: 'Desglose de Oro y Plata',
      zh: '黄金与白银明细分布',
      ja: '金・銀の内訳',
      hi: 'सोना बनाम चांदी विवरण',
    },
    'Dollar Impact & What-If Values': {
      th: 'ผลกระทบดอลลาร์และมูลค่าจำลอง',
      lo: 'ຜົນກະທົບໂດລາ ແລະ ມູນຄ່າຈຳລອງ',
      es: 'Impacto del Dólar y Escenarios',
      zh: '美元影响与假设估值',
      ja: 'ドル影響とシナリオ試算',
      hi: 'डॉलर प्रभाव और अनुमानित मूल्य',
    },
    'What 1 oz of Gold Buys': {
      th: 'ทองคำ 1 ออนซ์ซื้ออะไรได้บ้าง',
      lo: 'ຄຳ 1 ອອນສ໌ຊື້ຫຍັງໄດ້ແດ່',
      es: 'Qué Compra 1 oz de Oro',
      zh: '1盎司黄金的真实购买力',
      ja: '金1オンスで買えるもの',
      hi: '1 औंस सोना क्या खरीद सकता है',
    },
    'Best & Worst Months of the Year': {
      th: 'เดือนที่ดีที่สุดและแย่ที่สุดของปี',
      lo: 'ເດືອນທີ່ດີທີ່ສຸດ ແລະ ແຍ່ທີ່ສຸດຂອງປີ',
      es: 'Mejores y Peores Meses del Año',
      zh: '全年最佳与最差月份',
      ja: '年間ベスト・ワースト月',
      hi: 'साल के सबसे अच्छे और कमजोर महीने',
    },
    'Cheapest Time of Day to Buy': {
      th: 'ช่วงเวลาที่ราคามักถูกที่สุดของวัน',
      lo: 'ຊ່ວງເວລາທີ່ລາຄາມັກຖືກທີ່ສຸດໃນມື້',
      es: 'Mejor Hora del Día para Comprar',
      zh: '一天中最便宜的买入时段',
      ja: '1日で買いやすい時間帯',
      hi: 'खरीदने का दिन का सबसे सस्ता समय',
    },
    'Gold & Silver Mood Meter': {
      th: 'มาตรวัดอารมณ์ตลาดทองคำและเงิน',
      lo: 'ເຄື່ອງວັດອາລົມຕະຫຼາດຄຳ ແລະ ເງິນ',
      es: 'Medidor de Ánimo del Mercado',
      zh: '黄金与白银市场情绪仪',
      ja: '金・銀センチメントメーター',
      hi: 'सोना और चांदी मूड मीटर',
    },
    'Price Swing Weather': {
      th: 'สภาพอากาศความผันผวนของราคา',
      lo: 'ສະພາບຄວາມຜັນຜວນຂອງລາຄາ',
      es: 'Clima de Volatilidad de Precios',
      zh: '价格波动天气预报',
      ja: '価格変動ウェザー',
      hi: 'कीमत उतार-चढ़ाव मौसम',
    },
    'Live Price Check & Backup Protection': {
      th: 'ตรวจสอบราคาสดและระบบสำรองอัตโนมัติ',
      lo: 'ກວດສອບລາຄາສົດ ແລະ ລະບົບສຳຮອງ',
      es: 'Verificación de Precios y Respaldo',
      zh: '实时价格校验与容灾保护',
      ja: 'ライブ価格検証・保護',
      hi: 'लाइव कीमत जांच और सुरक्षा',
    },
    'Free Phone Alerts (ntfy App)': {
      th: 'แจ้งเตือนเข้ามือถือฟรี (แอป ntfy)',
      lo: 'ແຈ້ງເຕືອນເຂົ້າມືຖືຟຣີ (ແອັບ ntfy)',
      es: 'Alertas Gratis al Teléfono (ntfy)',
      zh: '免费手机推送提醒（ntfy）',
      ja: '無料スマホ通知（ntfy）',
      hi: 'मुफ़्त फ़ोन अलर्ट (ntfy ऐप)',
    },
    'Recent Alerts': { th: 'การแจ้งเตือนล่าสุด', lo: 'ການແຈ້ງເຕືອນຫຼ້າສຸດ', es: 'Alertas Recientes', zh: '最近提醒', ja: '最近の通知', hi: 'हालिया अलर्ट' },
    'Audio Summary Voice': { th: 'เสียงอ่านสรุปตลาด', lo: 'ສຽງອ່ານສະຫຼຸບຕະຫຼາດ', es: 'Voz del Resumen en Audio', zh: '语音播报设置', ja: '音声サマリー設定', hi: 'ऑडियो सारांश आवाज़' },

    // New Display & Lang Settings panel headings & controls
    'App Language': { th: 'ภาษาของแอป', lo: 'ພາສາຂອງແອັບ', es: 'Idioma de la App', zh: '应用语言', ja: 'アプリ言語', hi: 'ऐप भाषा' },
    'Designer Vault Themes': { th: 'ธีมห้องนิรภัยดีไซเนอร์', lo: 'ທີມຄັງຄຳດີໄຊເນີ', es: 'Temas de Bóveda de Diseñador', zh: '设计师金库主题', ja: 'デザイナーテーマ', hi: 'डिज़ाइनर वॉल्ट थीम' },
    'Wide-Screen & Ultrawide Desk': {
      th: 'โหมดหน้าจอกว้างและอัลตราไวด์',
      lo: 'ໂໝດໜ້າຈໍກວ້າງ ແລະ ອັນຕຣາໄວດ໌',
      es: 'Escritorio Panorámico y Ultrawide',
      zh: '宽屏分栏与超宽三栏交易台',
      ja: 'ワイド・ウルトラワイド表示',
      hi: 'वाइड-स्क्रीन और अल्ट्रावाइड डेस्क',
    },
    'OLED Burn-In Protection (Pixel-Shift)': {
      th: 'ป้องกันจอ OLED เบิร์น (ขยับพิกเซล)',
      lo: 'ປ້ອງກັນໜ້າຈໍ OLED ເບີນ (ຍ້າຍພິກເຊວ)',
      es: 'Protección OLED (Desplazamiento)',
      zh: 'OLED 防烧屏像素微移',
      ja: 'OLED焼き付き防止（ピクセルシフト）',
      hi: 'OLED बर्न-इन सुरक्षा (पिक्सेल-शिफ्ट)',
    },
    'Auto': { th: 'อัตโนมัติ', lo: 'ອັດຕະໂນມັດ', es: 'Automático', zh: '自动', ja: '自動', hi: 'ऑटो' },
    'Single View': { th: 'หน้าเดียว', lo: 'ໜ້າດຽວ', es: 'Vista Única', zh: '单栏视图', ja: '標準表示', hi: 'सिंगल व्यू' },
    'Split-Desk (1440px+)': { th: 'แบ่ง 2 จอ (1440px+)', lo: 'ແບ່ງ 2 ຈໍ (1440px+)', es: 'Dividido (1440px+)', zh: '分栏模式 (1440px+)', ja: '分割デスク (1440px+)', hi: 'स्प्लिट-डेस्क (1440px+)' },
    '3-Col Ultrawide': { th: '3 คอลัมน์จอกว้าง', lo: '3 ຖັນຈໍກວ້າງ', es: '3 Columnas Ultrawide', zh: '超宽3栏交易台', ja: '3列ウルトラワイド', hi: '3-कॉलम अल्ट्रावाइड' },
    'Single': { th: 'ปกติ', lo: 'ປົກກະຕິ', es: 'Normal', zh: '单栏', ja: '標準', hi: 'सिंगल' },
    'Split': { th: 'แบ่งจอ', lo: 'ແບ່ງຈໍ', es: 'Dividido', zh: '分栏', ja: '分割', hi: 'स्प्लिट' },
    '3-Col': { th: '3 คอลัมน์', lo: '3 ຖັນ', es: '3 Col', zh: '三栏', ja: '3列', hi: '3-कॉलम' },
    'Pinned Live Chart · Split-Desk': {
      th: 'ปักหมุดกราฟสด · โหมดแบ่งจอ',
      lo: 'ປັກໝຸດກຣາຟສົດ · ໂໝດແບ່ງຈໍ',
      es: 'Gráfico Fijo en Vivo · Dividido',
      zh: '固定实时图表 · 分栏模式',
      ja: 'ライブチャート固定・分割モード',
      hi: 'पिन किया लाइव चार्ट · स्प्लिट-डेस्क',
    },
    'Exit Split': { th: 'ออกโหมดแบ่งจอ', lo: 'ອອກໂໝດແບ່ງຈໍ', es: 'Salir', zh: '退出分栏', ja: '分割終了', hi: 'स्प्लिट बंद करें' },
    'Shift Now': { th: 'ทดสอบขยับเลย', lo: 'ທົດສອບຍ້າຍເລີຍ', es: 'Mover Ahora', zh: '立即微移', ja: '今すぐシフト', hi: 'अभी शिफ्ट करें' },

    // Market status & badges
    'Weekend Closed': { th: 'ปิดเสาร์-อาทิตย์', lo: 'ປິດທ້າຍອາທິດ', es: 'Cerrado Fin de Semana', zh: '周末休市', ja: '週末休場', hi: 'सप्ताहांत बंद' },
    'Quiet / Daily Break': { th: 'พักตลาดประจำวัน', lo: 'ພັກຕະຫຼາດປະຈຳວັນ', es: 'Pausa Diaria', zh: '每日休市时段', ja: '日次休止中', hi: 'दैनिक ब्रेक' },
    'Tight Supply': { th: 'ของเริ่มตึงตัว', lo: 'ສິນຄ້າເລີ່ມຕຶງຕົວ', es: 'Oferta Ajustada', zh: '供应偏紧', ja: '供給ひっ迫', hi: 'आपूर्ति तंग' },
    'Normal Supply': { th: 'อุปทานปกติ', lo: 'ອຸປະທານປົກກະຕິ', es: 'Oferta Normal', zh: '供应正常', ja: '通常供給', hi: 'सामान्य आपूर्ति' },
    'Good Value': { th: 'ราคาคุ้มค่า', lo: 'ລາຄາຄຸ້ມຄ່າ', es: 'Buen Valor', zh: '性价比高', ja: '割安', hi: 'अच्छा मूल्य' },
    'Bullish': { th: 'ขาขึ้น', lo: 'ຂາຂຶ້ນ', es: 'Alcista', zh: '看涨', ja: '強気', hi: 'तेज़ी' },
    'Bearish': { th: 'ขาลง', lo: 'ຂາລົງ', es: 'Bajista', zh: '看跌', ja: '弱気', hi: 'मंदी' },
    'Neutral': { th: 'ทรงตัว', lo: 'ຊົງຕົວ', es: 'Neutral', zh: '中性', ja: '中立', hi: 'तटस्थ' },
    'Clear': { th: 'ล้าง', lo: 'ລ້າງ', es: 'Limpiar', zh: '清空', ja: '消去', hi: 'साफ़ करें' },
    'Send Test Alert': { th: 'ส่งแจ้งเตือนทดสอบ', lo: 'ສົ່ງແຈ້ງເຕືອນທົດສອບ', es: 'Enviar Alerta de Prueba', zh: '发送测试推送', ja: 'テスト通知を送信', hi: 'टेस्ट अलर्ट भेजें' },
    'Test Big Move': { th: 'จำลองราคาพุ่ง/ร่วง', lo: 'ຈຳລອງລາຄາຂຶ້ນ/ລົງແຮງ', es: 'Probar Gran Movimiento', zh: '模拟大波动提醒', ja: '急変テスト', hi: 'बड़े बदलाव का टेस्ट' },
    'Turn On Browser Notifications': {
      th: 'เปิดการแจ้งเตือนบนเบราว์เซอร์',
      lo: 'ເປີດການແຈ້ງເຕືອນເທິງບຣາວເຊີ',
      es: 'Activar Notificaciones del Navegador',
      zh: '开启浏览器通知',
      ja: 'ブラウザ通知を有効化',
      hi: 'ब्राउज़र नोटिफ़िकेशन चालू करें',
    },
    'Fair Value': { th: 'ราคายุติธรรม', lo: 'ລາຄາຍຸຕິທຳ', es: 'Valor Justo', zh: '公允价值', ja: '適正価格', hi: 'उचित मूल्य' },
    'Squeeze Risk': { th: 'เสี่ยงราคาพุ่งแรง', lo: 'ສ່ຽງລາຄາພຸ່ງແຮງ', es: 'Riesgo de Subida', zh: '逼空风险', ja: '急騰リスク', hi: 'तेज़ उछाल जोखिम' },
    'Forecast': { th: 'คาดการณ์', lo: 'ຄາດຄະເນ', es: 'Pronóstico', zh: '预测区间', ja: '予測', hi: 'अनुमान' },
    'Patterns': { th: 'รูปแบบกราฟ', lo: 'ຮູບແບບກຣາຟ', es: 'Patrones', zh: '形态识别', ja: 'パターン', hi: 'पैटर्न' },
    'News Pins': { th: 'หมุดข่าว', lo: 'ໝຸດຂ່າວ', es: 'Noticias', zh: '新闻标记', ja: 'ニュース', hi: 'ख़बर पिन' },
  };

  // Partial status suffix replacements for dynamic strings like "China Market · Weekend"
  const SUB_STATUS = {
    'Weekend': { th: 'วันหยุด', lo: 'ທ້າຍອາທິດ', es: 'Fin de semana', zh: '周末休市', ja: '週末', hi: 'सप्ताहांत' },
    'Open Now': { th: 'เปิดอยู่', lo: 'ເປີດຢູ່', es: 'Abierto', zh: '交易中', ja: '取引中', hi: 'खुला है' },
    'Open · Day': { th: 'เปิด · กลางวัน', lo: 'ເປີດ · ກາງເວັນ', es: 'Abierto · Día', zh: '交易中·日盘', ja: '取引中・日中', hi: 'खुला · दिन' },
    'Open · Night': { th: 'เปิด · กลางคืน', lo: 'ເປີດ · ກາງຄືນ', es: 'Abierto · Noche', zh: '交易中·夜盘', ja: '取引中・夜間', hi: 'खुला · रात' },
    'Open · Busiest': { th: 'เปิด · คึกคักสุด', lo: 'ເປີດ · ຄຶກຄັກສຸດ', es: 'Abierto · Pico', zh: '活跃高峰', ja: '活況時間帯', hi: 'खुला · व्यस्ततम' },
    'Open · After-Hours': { th: 'เปิด · นอกเวลา', lo: 'ເປີດ · ນອກໂມງ', es: 'Abierto · Ext.', zh: '电子盘交易中', ja: '時間外取引中', hi: 'खुला · इलेक्ट्रॉनिक' },
    'Lunch Break': { th: 'พักเที่ยง', lo: 'ພັກທ່ຽງ', es: 'Pausa Mediodía', zh: '午间休市', ja: '昼休み', hi: 'लंच ब्रेक' },
    'Daily Break': { th: 'พักตลาด', lo: 'ພັກຕະຫຼາດ', es: 'Pausa Diaria', zh: '每日维护', ja: '日次休止', hi: 'दैनिक ब्रेक' },
    'Closed': { th: 'ปิดตลาด', lo: 'ປິດຕະຫຼາດ', es: 'Cerrado', zh: '休市', ja: '閉場', hi: 'बंद' },
  };

  /* ---------- State & Helpers ---------- */

  const PIXEL_SHIFT_ORBIT = [
    [0, 0],
    [2, 0],
    [3, 1],
    [3, 3],
    [1, 3],
    [0, 2],
    [-2, 2],
    [-3, 1],
    [-3, -1],
    [-1, -3],
    [0, -2],
    [2, -1],
  ];

  const ui = {
    initialized: false,
    toastTimer: null,
    shiftStep: 0,
    shiftTimer: null,
    observer: null,
    i18nRaf: null,
    isApplyingI18n: false,
    resizeTimer: null,
    chartDocked: false,
    ultrawideCol3: 'trade', // 'trade' | 'stack' | 'alerts'
  };

  function showToast(msg) {
    const el = document.getElementById('display-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('show');
    if (ui.toastTimer) clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => {
        if (!el.classList.contains('show')) el.hidden = true;
      }, 220);
    }, 2000);
  }

  /* ---------- #121 Theme Gallery & Cycling ---------- */

  function renderThemeGallery() {
    const grid = document.getElementById('vault-theme-grid');
    if (!grid) return;
    const b = B();
    const cur = b?.state?.settings?.theme || 'dark';
    grid.innerHTML = '';
    VAULT_THEMES.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `vault-theme-card${cur === t.id ? ' active' : ''}`;
      btn.dataset.themeId = t.id;
      btn.setAttribute('aria-pressed', cur === t.id ? 'true' : 'false');

      const swRow = document.createElement('div');
      swRow.className = 'vt-swatches';
      t.swatches.forEach((hex) => {
        const dot = document.createElement('span');
        dot.className = 'vt-swatch';
        dot.style.backgroundColor = hex;
        swRow.appendChild(dot);
      });

      const title = document.createElement('strong');
      title.className = 'vt-name';
      title.textContent = t.name;

      const desc = document.createElement('span');
      desc.className = 'vt-desc';
      desc.textContent = t.desc;

      btn.appendChild(swRow);
      btn.appendChild(title);
      btn.appendChild(desc);

      btn.addEventListener('click', () => {
        selectTheme(t.id, true);
      });
      grid.appendChild(btn);
    });
  }

  function syncThemeUi() {
    const b = B();
    const cur = b?.state?.settings?.theme || 'dark';
    const metaTheme = THEME_MAP[cur] || THEME_MAP.dark;
    const metaEl = document.getElementById('meta-theme-color');
    if (metaEl) metaEl.setAttribute('content', metaTheme.metaColor);

    const themeBtn = document.getElementById('btn-theme');
    if (themeBtn) {
      themeBtn.title = `Theme: ${metaTheme.name} — click to switch`;
      themeBtn.setAttribute('aria-label', `Current theme ${metaTheme.name}. Click to cycle vault themes`);
    }

    document.querySelectorAll('#vault-theme-grid .vault-theme-card').forEach((card) => {
      const active = card.dataset.themeId === cur;
      card.classList.toggle('active', active);
      card.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function selectTheme(themeId, announce = false) {
    const b = B();
    if (!b || !THEME_MAP[themeId]) return;
    b.applyTheme(themeId);
    b.savePersistedState();
    syncThemeUi();
    if (announce) {
      const meta = THEME_MAP[themeId];
      showToast(`🎨 Theme: ${meta.name}`);
    }
  }

  function cycleTheme() {
    const b = B();
    const cur = b?.state?.settings?.theme || 'dark';
    const idx = VAULT_THEMES.findIndex((t) => t.id === cur);
    const next = VAULT_THEMES[(idx + 1) % VAULT_THEMES.length];
    selectTheme(next.id, true);
  }

  /* ---------- #112 Language Switcher & Instant DOM Translator ---------- */

  function translateString(raw, lang) {
    if (!raw || lang === 'en') return raw;
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    const exact = PHRASES[trimmed]?.[lang];
    if (exact) return raw.replace(trimmed, exact);

    // Handle "Hub Tag · Status" pattern cleanly (e.g. "China Market · Weekend")
    const dotParts = trimmed.split(' · ');
    if (dotParts.length === 2 && SUB_STATUS[dotParts[1]]?.[lang]) {
      return `${dotParts[0]} · ${SUB_STATUS[dotParts[1]][lang]}`;
    }
    return raw;
  }

  const I18N_SELECTOR = [
    '.nav-btn span',
    '.header-melt-k',
    '.section-label',
    '.sub-tab-btn',
    '.panel-title',
    '.metal-name',
    '.futures-name',
    '.stat-label',
    '.signal-pill',
    '.regime-pill',
    '.chip-toggle',
    '.segmented button',
    '.btn',
    '.vault-hub-sub',
    '.desk-pill-btn',
    '.split-pinned-label',
  ].join(', ');

  function applyLanguageToDom(lang) {
    if (ui.isApplyingI18n) return;
    ui.isApplyingI18n = true;
    try {
      document.documentElement.lang = lang;
      const nodes = document.querySelectorAll(I18N_SELECTOR);
      nodes.forEach((el) => {
        // Only translate pure-text leaf elements (or simple span/strong without nested interactive inputs)
        if (el.children.length > 0) return;
        const currentText = el.textContent;
        if (!currentText || !currentText.trim()) return;
        if (el.dataset.i18nOrig === undefined) {
          el.dataset.i18nOrig = currentText;
          el.dataset.i18nRendered = currentText;
        } else {
          // Only update cached English original if external JS overwrote the element with a brand-new string
          if (currentText !== el.dataset.i18nRendered && currentText !== el.dataset.i18nOrig) {
            el.dataset.i18nOrig = currentText;
          }
        }
        const orig = el.dataset.i18nOrig;
        const nextText = lang === 'en' ? orig : translateString(orig, lang);
        el.dataset.i18nRendered = nextText;
        if (nextText !== currentText) {
          el.textContent = nextText;
        }
      });
    } finally {
      ui.isApplyingI18n = false;
    }
  }

  function scheduleI18nRefresh() {
    const lang = B()?.state?.settings?.language || 'en';
    if (lang === 'en') return;
    if (ui.i18nRaf) return;
    ui.i18nRaf = requestAnimationFrame(() => {
      ui.i18nRaf = null;
      applyLanguageToDom(B()?.state?.settings?.language || 'en');
    });
  }

  function renderLanguageControls() {
    const lang = B()?.state?.settings?.language || 'en';
    const topSel = document.getElementById('select-language');
    if (topSel && topSel.value !== lang) topSel.value = lang;

    const pillWrap = document.getElementById('settings-lang-pills');
    if (pillWrap) {
      if (!pillWrap.children.length) {
        LANGUAGES.forEach((l) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'lang-pill-btn';
          btn.dataset.langCode = l.code;
          btn.textContent = l.label;
          btn.addEventListener('click', () => setLanguage(l.code, true));
          pillWrap.appendChild(btn);
        });
      }
      pillWrap.querySelectorAll('.lang-pill-btn').forEach((btn) => {
        const act = btn.dataset.langCode === lang;
        btn.classList.toggle('active', act);
        btn.setAttribute('aria-pressed', act ? 'true' : 'false');
      });
    }
  }

  function setLanguage(langCode, announce = false) {
    const b = B();
    const valid = LANGUAGES.find((l) => l.code === langCode) ? langCode : 'en';
    if (b?.state?.settings) {
      b.state.settings.language = valid;
      b.savePersistedState();
    }
    renderLanguageControls();
    applyLanguageToDom(valid);
    if (announce) {
      const meta = LANGUAGES.find((l) => l.code === valid);
      showToast(`🌐 ${meta ? meta.label : 'English'}`);
    }
  }

  /* ---------- #131 Split-Desk (1440px+) & #179 Ultrawide 3-Col Desk ---------- */

  function computeEffectiveDeskMode() {
    const pref = B()?.state?.settings?.deskLayout || 'auto';
    const w = window.innerWidth;
    if (w < 1440) return 'single';
    if (pref === 'single') return 'single';
    if (pref === 'split') return 'split';
    if (pref === 'ultrawide') return w >= 1680 ? 'ultrawide' : 'split';
    // 'auto': automatically turns on 3-Column Trading Desk on true 21:9 / 32:9 ultrawides (2200px+)
    return w >= 2200 ? 'ultrawide' : 'single';
  }

  function dockChartToSplit(shouldDock) {
    const chartPanel = document.getElementById('panel-chart');
    const splitSlot = document.getElementById('split-desk-chart-slot');
    const splitAside = document.getElementById('split-desk-left');
    const anchor = document.getElementById('panel-chart-anchor');
    if (!chartPanel || !splitSlot || !splitAside || !anchor) return;

    if (shouldDock && !ui.chartDocked) {
      splitSlot.appendChild(chartPanel);
      chartPanel.classList.remove('sub-hidden');
      splitAside.hidden = false;
      ui.chartDocked = true;
    } else if (!shouldDock && ui.chartDocked) {
      anchor.parentNode.insertBefore(chartPanel, anchor.nextSibling);
      splitAside.hidden = true;
      ui.chartDocked = false;
      B()?.applyAllSubViews?.();
    } else if (shouldDock) {
      chartPanel.classList.remove('sub-hidden');
      splitAside.hidden = false;
    } else {
      splitAside.hidden = true;
    }
  }

  function applyDeskLayout(forceRender = false) {
    const b = B();
    const pref = b?.state?.settings?.deskLayout || 'auto';
    const effective = computeEffectiveDeskMode();
    const prev = document.body.dataset.deskActive || 'single';

    document.body.dataset.deskActive = effective;
    document.body.dataset.deskPref = pref;
    document.body.dataset.deskCol3 = ui.ultrawideCol3;

    // #131 Split-Desk: dock live chart permanently on the left half
    dockChartToSplit(effective === 'split');

    // Sync header quick desk buttons (visible >= 1440px)
    document.querySelectorAll('#desk-mode-bar .desk-pill-btn').forEach((btn) => {
      const m = btn.dataset.deskMode;
      const isAct = (pref === 'auto' && m === effective) || pref === m;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');
    });

    // Sync Settings -> Display & Lang layout buttons
    document.querySelectorAll('#settings-desk-btns .desk-opt-btn').forEach((btn) => {
      const act = btn.dataset.deskMode === pref;
      btn.classList.toggle('active', act);
      btn.setAttribute('aria-pressed', act ? 'true' : 'false');
    });

    // Update live screen-width readout in Settings
    const screenInfo = document.getElementById('desk-screen-status');
    if (screenInfo) {
      const w = window.innerWidth;
      const activeLabel =
        effective === 'ultrawide'
          ? '3-Column Ultrawide Active'
          : effective === 'split'
            ? 'Split-Desk Active (Live Chart Pinned Left)'
            : 'Single View Active';
      const tip =
        w < 1440
          ? 'Resize window to 1440px+ for Split-Desk or 1680px+ for 3-Column Ultrawide.'
          : w < 1680
            ? 'Split-Desk ready! Widen to 1680px+ for 3-Column Ultrawide.'
            : 'Both Split-Desk and 3-Column Ultrawide are ready on this monitor.';
      screenInfo.textContent = `Current screen: ${w}px · ${activeLabel}. ${tip}`;
    }

    if (prev !== effective || forceRender) {
      requestAnimationFrame(() => {
        b?.renderChart?.();
        if (effective === 'ultrawide') {
          const res = b?.computeInteractiveOutlook?.();
          b?.renderOutlook?.();
          if (res) {
            b?.renderRatioAnalytics?.(res);
            b?.renderBuyLadder?.(res);
          }
          b?.renderRatioSwapCalculator?.();
          b?.renderDealGrader?.();
          b?.renderStackTracker?.();
          window.BullionIntel?.renderAll?.();
        }
      });
    }
  }

  function setDeskLayout(mode, announce = false) {
    const b = B();
    const allowed = new Set(['auto', 'single', 'split', 'ultrawide']);
    const next = allowed.has(mode) ? mode : 'auto';
    if (b?.state?.settings) {
      b.state.settings.deskLayout = next;
      b.savePersistedState();
    }
    applyDeskLayout(true);
    if (announce) {
      const labels = {
        auto: 'Auto Desk Layout',
        single: 'Single View',
        split: window.innerWidth >= 1440 ? 'Split-Desk (Chart Pinned Left)' : 'Split-Desk (activates at 1440px+)',
        ultrawide: window.innerWidth >= 1680 ? '3-Column Ultrawide Desk' : '3-Col Desk (activates at 1680px+)',
      };
      showToast(`🖥️ ${labels[next]}`);
    }
  }

  function onViewChange(viewName) {
    if (viewName === 'trade' || viewName === 'stack' || viewName === 'alerts') {
      ui.ultrawideCol3 = viewName;
      document.body.dataset.deskCol3 = ui.ultrawideCol3;
    }
    if (document.body.dataset.deskActive === 'split') {
      dockChartToSplit(true);
      requestAnimationFrame(() => B()?.renderChart?.());
    }
  }

  /* ---------- #181 OLED Burn-In-Safe Pixel-Shift Display ---------- */

  function updatePixelShiftDom() {
    const enabled = Boolean(B()?.state?.settings?.oledPixelShift);
    const [dx, dy] = enabled ? PIXEL_SHIFT_ORBIT[ui.shiftStep % PIXEL_SHIFT_ORBIT.length] : [0, 0];

    document.body.classList.toggle('pixel-shift-on', enabled);
    document.documentElement.style.setProperty('--oled-shift-x', `${dx}px`);
    document.documentElement.style.setProperty('--oled-shift-y', `${dy}px`);

    const chk = document.getElementById('chk-oled-pixel-shift');
    if (chk) chk.checked = enabled;

    const pill = document.getElementById('oled-shift-status');
    if (pill) {
      if (enabled) {
        const sx = dx >= 0 ? `+${dx}` : `${dx}`;
        const sy = dy >= 0 ? `+${dy}` : `${dy}`;
        pill.textContent = `Active · ${sx}px, ${sy}px`;
        pill.className = 'signal-pill bullish';
      } else {
        pill.textContent = 'Off';
        pill.className = 'signal-pill';
      }
    }
  }

  function startOrStopPixelShift() {
    const enabled = Boolean(B()?.state?.settings?.oledPixelShift);
    if (ui.shiftTimer) {
      clearInterval(ui.shiftTimer);
      ui.shiftTimer = null;
    }
    if (enabled) {
      ui.shiftTimer = setInterval(() => {
        ui.shiftStep = (ui.shiftStep + 1) % PIXEL_SHIFT_ORBIT.length;
        updatePixelShiftDom();
      }, 60 * 1000);
    } else {
      ui.shiftStep = 0;
    }
    updatePixelShiftDom();
  }

  function setOledPixelShift(enabled, announce = false) {
    const b = B();
    if (b?.state?.settings) {
      b.state.settings.oledPixelShift = Boolean(enabled);
      b.savePersistedState();
    }
    if (enabled && ui.shiftStep === 0) ui.shiftStep = 1;
    startOrStopPixelShift();
    if (announce) {
      showToast(enabled ? '🛡️ OLED Pixel-Shift ON (drifts ±3px every 60s)' : 'OLED Pixel-Shift OFF');
    }
  }

  function previewPixelShiftNow() {
    const b = B();
    if (b?.state?.settings && !b.state.settings.oledPixelShift) {
      b.state.settings.oledPixelShift = true;
      b.savePersistedState();
      startOrStopPixelShift();
    }
    ui.shiftStep = (ui.shiftStep + 1) % PIXEL_SHIFT_ORBIT.length;
    updatePixelShiftDom();
    const [dx, dy] = PIXEL_SHIFT_ORBIT[ui.shiftStep];
    showToast(`🛡️ Shifted to (${dx >= 0 ? '+' : ''}${dx}px, ${dy >= 0 ? '+' : ''}${dy}px)`);
  }

  /* ---------- Wiring & Boot ---------- */

  function wireControls() {
    document.getElementById('select-language')?.addEventListener('change', (e) => {
      setLanguage(e.target.value, true);
    });

    document.querySelectorAll('#desk-mode-bar .desk-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setDeskLayout(btn.dataset.deskMode, true);
      });
    });

    document.querySelectorAll('#settings-desk-btns .desk-opt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setDeskLayout(btn.dataset.deskMode, true);
      });
    });

    document.getElementById('btn-exit-split-desk')?.addEventListener('click', () => {
      setDeskLayout('single', true);
    });

    document.getElementById('chk-oled-pixel-shift')?.addEventListener('change', (e) => {
      setOledPixelShift(e.target.checked, true);
    });

    document.getElementById('btn-oled-shift-now')?.addEventListener('click', () => {
      previewPixelShiftNow();
    });

    window.addEventListener('resize', () => {
      if (ui.resizeTimer) clearTimeout(ui.resizeTimer);
      ui.resizeTimer = setTimeout(() => applyDeskLayout(false), 120);
    });

    // Keep dynamically re-rendered panels translated automatically
    const root = document.querySelector('.app-shell');
    if (root && typeof MutationObserver !== 'undefined') {
      ui.observer = new MutationObserver(() => {
        if (!ui.isApplyingI18n && (B()?.state?.settings?.language || 'en') !== 'en') {
          scheduleI18nRefresh();
        }
      });
      ui.observer.observe(root, { childList: true, subtree: true, characterData: true });
    }
  }

  function syncAll() {
    renderThemeGallery();
    syncThemeUi();
    renderLanguageControls();
    applyLanguageToDom(B()?.state?.settings?.language || 'en');
    applyDeskLayout(false);
    startOrStopPixelShift();
  }

  function init() {
    if (ui.initialized) {
      syncAll();
      return;
    }
    ui.initialized = true;
    wireControls();
    syncAll();
  }

  window.BullionDisplay = {
    VAULT_THEMES,
    LANGUAGES,
    init,
    syncAll,
    syncThemeUi,
    selectTheme,
    cycleTheme,
    setLanguage,
    setDeskLayout,
    applyDeskLayout,
    onViewChange,
    setOledPixelShift,
    previewPixelShiftNow,
  };

  if (document.readyState !== 'loading' && window.__BP_BRIDGE) {
    init();
  }
})();

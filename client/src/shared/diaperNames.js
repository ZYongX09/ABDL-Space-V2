/**
 * 纸尿裤商品中文名称映射
 * 支持两种 key：slug（abu-alphagatorz）或 brand::model（ABU::Little Kings）
 */
const DIAPER_NAMES = {
  // ===== ABU 品牌（slug 方式） =====
  'abu-alphagatorz':               '鳄鱼宝宝',
  'abu-bunnyhopps-4-tape':         '兔兔跳跳（四贴）',
  'abu-dinorawrz':                 '恐龙宝贝',
  'abu-little-kings':              '小狮子',
  'abu-littlepawz':                '小爪爪',
  'abu-oops-all-huskies':          '哈士奇乐园',
  'abu-peekabu':                   '躲猫猫',
  'abu-simple-daytime':            '日用轻薄款',
  'abu-simple-ultra':              '超薄日用款',
  'abu-super-dry-kids':            '超干宝宝',
  'abu-tinytails':                 '小尾巴',

  // ===== REARZ 品牌（slug 方式） =====
  'rearz-animal-parade-mixed-case':      '动物游行混合装',
  'rearz-baby-girl-mixed-case':          '芭比女孩混合装',
  'rearz-bedry-elitecare':               '干爽精英护理',
  'rearz-bedry-night':                   '干爽夜用款',
  'rearz-bedry-ultra-premium-underwear': '超干爽高端拉拉裤',
  'rearz-bunnyboo-adult-diapers':        '兔兔宝贝',
  'rearz-classic-mixed-case':            '经典混合装',
  'rearz-daydreamer-adult-diapers-2xl':  '白日梦（加大码）',
  'rearz-daydreamer-diapers':            '白日梦',
  'rearz-holiday-diaper-sticker-5-packs':'节日贴纸（5张装）',
  'rearz-home-run-fontals':              '本垒打定制贴纸',
  'rearz-incontrol-active-air-incontinence-briefs': '活力透气款',
  'rearz-incontrol-bedry-elitecare-incontinence-briefs-2xl': '干爽精英护理（加大码）',
  'rearz-incontrol-bedry-premium-incontinence-briefs': '干爽高端护理',
  'rearz-incontrol-booster-pads-unscented':     '无香增强垫',
  'rearz-large-diaper-pail-deodorizer-discs-40': '尿布桶除臭片（40片）',
  'rearz-lil-mixed-diaper-case':         '小混装纸尿裤',
  'rearz-lil-squirts-adult-diapers-splash': '小水花',
  'rearz-lunar-cub-adult-diapers':       '月光小熊',
  'rearz-mega-critter-caboose-adult-diapers': '小怪兽便便裤',
  'rearz-mega-dinosaur-adult-diapers':   '恐龙探险',
  'rearz-mega-inspire-adult-diapers':    '灵感夜用款',
  'rearz-mega-safari-adult-diapers':     '丛林探险',
  'rearz-princess-pink-adult-diapers':   '粉色公主',
  'rearz-rearz-alpaca-overnight-diapers': '羊驼夜用款',
  'rearz-rearz-diaper-lover-stack':      '纸尿裤爱好者套装',
  'rearz-rearz-dl-weekend-warrior-pack': '周末战士套装',
  'rearz-rearz-lil-monsters-adult-diapers': '小怪兽',
  'rearz-rearz-overnight-adult-booster-pads': '夜用增强垫',
  'rearz-rearz-ultimate-printed-mixed-pack': '终极印花混合装',

  // ===== 后端 API 商品（brand::model 方式） =====
  'ABU::Little Kings':             '小狮子',
  'ABU::Bunny Hopps 梦幻小粉兔':   '兔兔跳跳（梦幻小粉兔）',
};

/**
 * 获取中文名称，支持 slug 或 brand+model 匹配
 */
export function getChineseName(slugOrId, fallbackName, brand, model) {
  // 1. 直接 slug 匹配
  if (slugOrId && DIAPER_NAMES[slugOrId]) return DIAPER_NAMES[slugOrId];
  // 2. brand::model 匹配
  if (brand && model) {
    const key = `${brand}::${model}`;
    if (DIAPER_NAMES[key]) return DIAPER_NAMES[key];
  }
  // 3. 回退
  return fallbackName || model || slugOrId;
}

export default DIAPER_NAMES;

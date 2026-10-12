import type { LanguageDetectionResult, LanguageDetectorInstance } from '../types/translator'
import { normalizeLanguageTag, prefersTraditionalChinese } from './languages'
import { TranslateError } from './translate'

export type DetectionSource = 'script' | 'model' | 'hint'

export interface Detection {
  /** Translator API tag (e.g. `ja`, `zh-Hant`), or null when we can't tell. */
  language: string | null
  confidence: number
  source: DetectionSource | null
}

export interface DetectOptions {
  /**
   * Languages that are plausible for this text, most likely first — the page's
   * `<html lang>`, the user's browser languages. Used to break ties on short,
   * ambiguous input, never to override a confident result.
   */
  hints?: string[]
  signal?: AbortSignal
}

// Above this the model's top answer is taken as-is.
const CONFIDENT = 0.7
// Below this the top answer is treated as noise.
const PLAUSIBLE = 0.4
// A hinted language is accepted at this confidence when the top answer isn't confident.
const HINT_PLAUSIBLE = 0.15

// Scripts used by exactly one Translator-supported language. Text written mostly in one
// of these can be classified without the model — which matters for short selections,
// where the model is least reliable.
const UNIQUE_SCRIPTS: [RegExp, string][] = [
  [/[가-힯ᄀ-ᇿ㄰-㆏]/gu, 'ko'],
  [/[฀-๿]/gu, 'th'],
  [/[֐-׿]/gu, 'he'],
  [/[Ͱ-Ͽἀ-῿]/gu, 'el'],
  [/[ঀ-৿]/gu, 'bn'],
  [/[஀-௿]/gu, 'ta'],
  [/[ఀ-౿]/gu, 'te'],
  [/[ಀ-೿]/gu, 'kn'],
]
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/gu
const HAN = /[㐀-䶿一-鿿豈-﫿]/gu
const LETTER = /\p{L}/gu

// Common characters whose form differs between Simplified and Traditional Chinese, so
// even a short phrase usually contains a couple.
const SIMPLIFIED_ONLY =
  '们这个来说时会对学国发经过还没为东车长门问间话见让认识请读写书买卖开关难题习边进远选钱银铁错觉观视亲热点钟变应实现电脑网络后里头众无与业专丢两严丧个丰临为举义乐习乡书买乱争亚产亩亲亿仅从仓们价众优会伞伟传伤伦伪体佣侠侣侦侧侨侬俩俭债倾偿储儿兑党兰关兴养兽内册写军农冲决况冻净准凉减凤凭凯击凿刘则刚创删别刮制刹剂剑剧劝办务动励劲劳势勋区医华协单卖卢卫却厂厅历压厌厕县参双发变叙叶号叹后吓吕吗吨听启吴呐员呜咏响哑哗唤啬啰喷嘱团园围图圆圣场坏块坚坛坝坟坠垄垒垦垫堕墙壮声处备复够头夸夺奋奖妆妇妈娱婴婶孙学宁宝实宠审宪宫宽宾对寻导寿将尔尘尝层属岁岂岗岛岭岳峡币师帐帘带帮库应庙庞废开异弃张弥弯弹归录彻忆忧怀态怜总恋恳恶恼悦悬惊惧惨惯愤愿戏战户扑执扩扫扬扰抚抛抢护报担拟拢拥择挂挡挣挤挥损换据掳掷揽搀搁搂携摄摆摇摊撑撵擞斗断无旧时旷昼显晋晒晓晕暂术机杀杂权杆条来杨极构枢枪枫柜标栋栏树样档桥桨桩梦检椭楼榄横欢欧歼毁毕毙气汇汉汤沟没沪泪泼泽洁洒浅浆浇浊测济浏浑浓涂涌涛涝涡润涧涨涩渊渐渔湾湿溃滚满滤滥滨灭灯灵灾灿炉炖炮点炼烂烛烟烦烧烫热焕爱爷牵牺犹狈独狭狮猎猪猫献环现玛珐珑琐琼瓯电画畅疗疮疯痒痪痫瘪瘫瘾皱盏盐监盖盘眯着睁矫矿码砖砚础硕确碍礼祷祸离秃种积称秽稳穷窃窍窑窜窝竖竞笔笼筑筛签简箩篮篱粮紧纠红纤约级纪纬纯纱纲纳纵纷纸纹纺线练组细织终绍经结绕绘给络绝统继绩绪续绳维绵综绿缀缓编缘缠缩缴网罗罚罢羡翘耸聋职联肃肠肤肾肿胀胁胆胜胶脉脏脑脚脱脸腊腻舆舱艰艳节芜芦苍苏苹范茎茧荐荡荣药莱莲获莹营萝萧萨蓝蔼蕴虏虑虚虫虽虾蚀蚁蚕蛮蜡蝇蝉衅补衬袄袜装裤见观规视览觉触誉计订认讥讨让训议讯记讲讳许论讼设访证评识诈诉词译试诗诚话诞询该详语误诱说请诸诺读课谁调谅谈谊谋谎谐谓谜谢谣谦谨谱贝负贡财责贤败账货质贩贪贫贬购贯贱贴贵贷贸费贺贼资赋赌赏赐赔赖赚赛赞赠赵赶趋跃践踊踪躯车轨轩转轮软轰轻载较辅辆辈辉辑输辖辩辫边辽达迁过迈运还这进远违连迟适选逊递逻遗邓邮邻郑郁酝酱酿释钉针钓钙钞钟钢钥钦钩钮钱钳钻铁铃铅铜铝铭铲银铸铺链销锁锅锈锋锐错锡锣锤锦键锯镇镜长门闪闭问闯闲间闷闸闹闻阀阁阅阐阔队阳阴阵阶际陆陈陕险随隐隶难雏雾霉静顶顷项顺须顽顾顿颁颂预领颇颈频颗题颜额风飘飞饥饭饮饰饱饲饶饺饼馆馈首驱驳驴驶驻驾骂骄骆验骑骗骚骤鱼鲜鸟鸡鸣鸭鸽鹅鹰麦黄齐齿龄龙龟'
const TRADITIONAL_ONLY =
  '們這個來說時會對學國發經過還沒為東車長門問間話見讓認識請讀寫書買賣開關難題習邊進遠選錢銀鐵錯覺觀視親熱點鐘變應實現電腦網絡後裡頭眾無與業專丟兩嚴喪個豐臨為舉義樂習鄉書買亂爭亞產畝親億僅從倉們價眾優會傘偉傳傷倫偽體傭俠侶偵側僑儂倆儉債傾償儲兒兌黨蘭關興養獸內冊寫軍農衝決況凍淨準涼減鳳憑凱擊鑿劉則剛創刪別颳製剎劑劍劇勸辦務動勵勁勞勢勳區醫華協單賣盧衛卻廠廳歷壓厭廁縣參雙發變敘葉號嘆後嚇呂嗎噸聽啟吳吶員嗚詠響啞嘩喚嗇囉噴囑團園圍圖圓聖場壞塊堅壇壩墳墜壟壘墾墊墮牆壯聲處備複夠頭誇奪奮獎妝婦媽娛嬰嬸孫學寧寶實寵審憲宮寬賓對尋導壽將爾塵嘗層屬歲豈崗島嶺嶽峽幣師帳簾帶幫庫應廟龐廢開異棄張彌彎彈歸錄徹憶憂懷態憐總戀懇惡惱悅懸驚懼慘慣憤願戲戰戶撲執擴掃揚擾撫拋搶護報擔擬攏擁擇掛擋掙擠揮損換據擄擲攬攙擱摟攜攝擺搖攤撐攆擻鬥斷無舊時曠晝顯晉曬曉暈暫術機殺雜權桿條來楊極構樞槍楓櫃標棟欄樹樣檔橋槳樁夢檢橢樓欖橫歡歐殲毀畢斃氣匯漢湯溝沒滬淚潑澤潔灑淺漿澆濁測濟瀏渾濃塗湧濤澇渦潤澗漲澀淵漸漁灣濕潰滾滿濾濫濱滅燈靈災燦爐燉炮點煉爛燭煙煩燒燙熱煥愛爺牽犧猶狽獨狹獅獵豬貓獻環現瑪琺瓏瑣瓊甌電畫暢療瘡瘋癢瘓癇癟癱癮皺盞鹽監蓋盤瞇著睜矯礦碼磚硯礎碩確礙禮禱禍離禿種積稱穢穩窮竊竅窯竄窩豎競筆籠築篩簽簡籮籃籬糧緊糾紅纖約級紀緯純紗綱納縱紛紙紋紡線練組細織終紹經結繞繪給絡絕統繼績緒續繩維綿綜綠綴緩編緣纏縮繳網羅罰罷羨翹聳聾職聯肅腸膚腎腫脹脅膽勝膠脈髒腦腳脫臉臘膩輿艙艱豔節蕪蘆蒼蘇蘋範莖繭薦蕩榮藥萊蓮獲瑩營蘿蕭薩藍藹蘊虜慮虛蟲雖蝦蝕蟻蠶蠻蠟蠅蟬釁補襯襖襪裝褲見觀規視覽覺觸譽計訂認譏討讓訓議訊記講諱許論訟設訪證評識詐訴詞譯試詩誠話誕詢該詳語誤誘說請諸諾讀課誰調諒談誼謀謊諧謂謎謝謠謙謹譜貝負貢財責賢敗賬貨質販貪貧貶購貫賤貼貴貸貿費賀賊資賦賭賞賜賠賴賺賽贊贈趙趕趨躍踐踴蹤軀車軌軒轉輪軟轟輕載較輔輛輩輝輯輸轄辯辮邊遼達遷過邁運還這進遠違連遲適選遜遞邏遺鄧郵鄰鄭鬱醞醬釀釋釘針釣鈣鈔鐘鋼鑰欽鉤鈕錢鉗鑽鐵鈴鉛銅鋁銘鏟銀鑄鋪鏈銷鎖鍋鏽鋒銳錯錫鑼錘錦鍵鋸鎮鏡長門閃閉問闖閒間悶閘鬧聞閥閣閱闡闊隊陽陰陣階際陸陳陝險隨隱隸難雛霧黴靜頂頃項順須頑顧頓頒頌預領頗頸頻顆題顏額風飄飛飢飯飲飾飽飼饒餃餅館饋首驅駁驢駛駐駕罵驕駱驗騎騙騷驟魚鮮鳥雞鳴鴨鴿鵝鷹麥黃齊齒齡龍龜'

// Characters that are also in normal use in the *other* script (制度, 批准, 皇后, 公里,
// 著名, 北斗, 鰂魚涌...), so they say nothing about which script the text is in.
const AMBIGUOUS = new Set('制范准佣岳杆涌斗刮颳后里炮首叶虫筑帘冲著')
const SIMPLIFIED_SET = new Set([...SIMPLIFIED_ONLY, '么'].filter((c) => !AMBIGUOUS.has(c)))
const TRADITIONAL_SET = new Set([...TRADITIONAL_ONLY, '裏', '麼', '於', '爲'].filter((c) => !AMBIGUOUS.has(c)))

function count(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0
}

/**
 * Decide Simplified vs Traditional for Han text. Returns null when the text uses
 * only characters common to both (e.g. 中文, 日本), leaving it to the caller.
 */
export function chineseVariant(text: string): 'zh' | 'zh-Hant' | null {
  let simp = 0
  let trad = 0
  for (const ch of text) {
    if (SIMPLIFIED_SET.has(ch)) simp++
    else if (TRADITIONAL_SET.has(ch)) trad++
  }
  if (trad > simp) return 'zh-Hant'
  if (simp > trad) return 'zh'
  return null
}

/**
 * Classify text by writing system alone. Handles the cases the model gets wrong most
 * often on short input: kanji-only Japanese read as Chinese, Traditional vs Simplified,
 * and short Korean/Thai/Greek/... snippets. Returns null for scripts shared by several
 * languages (Latin, Cyrillic, Arabic, Devanagari), which need the model.
 */
export function detectByScript(text: string, hints: string[] = []): string | null {
  const letters = count(text, LETTER)
  if (letters === 0) return null

  for (const [re, lang] of UNIQUE_SCRIPTS) {
    if (count(text, re) / letters >= 0.5) return lang
  }

  const kana = count(text, KANA)
  const han = count(text, HAN)
  if ((kana + han) / letters < 0.5) return null

  // Any meaningful amount of kana means Japanese; Chinese never uses it.
  if (kana > 0 && kana / (kana + han) >= 0.05) return 'ja'
  if (han === 0) return null

  // Han only. Kanji-only Japanese (東京都, 会議室) is indistinguishable by script,
  // so honour a Japanese hint (usually the page's <html lang="ja">).
  const firstCjkHint = hints.find((h) => h === 'ja' || h === 'zh' || h === 'zh-Hant')
  if (firstCjkHint === 'ja') return 'ja'

  return chineseVariant(text) ?? firstCjkHint ?? (prefersTraditionalChinese() ? 'zh-Hant' : 'zh')
}

/**
 * Pick a language from raw model output. Merges results that normalize to the same
 * Translator tag, drops unsupported ones, and only falls back on hints when the
 * model itself is unsure.
 */
export function pickFromModel(results: LanguageDetectionResult[], hints: string[] = []): Detection {
  const merged = new Map<string, number>()
  for (const r of results) {
    const tag = normalizeLanguageTag(r.detectedLanguage)
    if (tag) merged.set(tag, (merged.get(tag) ?? 0) + r.confidence)
  }
  const ranked = [...merged.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return { language: null, confidence: 0, source: null }

  const [topLang, topConf] = ranked[0]
  if (topConf >= CONFIDENT) return { language: topLang, confidence: topConf, source: 'model' }

  for (const hint of hints) {
    const conf = merged.get(hint)
    if (conf !== undefined && conf >= HINT_PLAUSIBLE) return { language: hint, confidence: conf, source: 'hint' }
  }

  if (topConf >= PLAUSIBLE) return { language: topLang, confidence: topConf, source: 'model' }
  return { language: null, confidence: topConf, source: null }
}

let detectorPromise: Promise<LanguageDetectorInstance> | null = null

function getDetector(): Promise<LanguageDetectorInstance> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      if (!globalThis.LanguageDetector) throw new Error('LanguageDetector API is not available in this browser')
      const availability = await globalThis.LanguageDetector.availability()
      if (availability === 'unavailable') throw new Error('Language detection model is unavailable on this device')
      return globalThis.LanguageDetector.create()
    })()
    // Don't cache failures: the next call (often with a fresh user gesture) may succeed.
    detectorPromise.catch(() => (detectorPromise = null))
  }
  return detectorPromise
}

/** Create (downloading if needed) the detection model ahead of time. Must run inside a user gesture if it downloads. */
export async function prepareDetector(): Promise<void> {
  try {
    await getDetector()
  } catch (err) {
    if ((err as Error)?.name === 'NotAllowedError') throw new TranslateError('needs-activation', 'The language detection model must be downloaded first')
    throw err
  }
}

/** Strip things that confuse detection without carrying language: URLs, emails, numbers. */
function cleanForDetection(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\S+@\S+\.\S+/g, ' ')
    .replace(/[\d\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Detect the language of `text`, returning a tag the Translator API accepts — or
 * `language: null` if unsure. Callers must handle null rather than defaulting to
 * English: guessing is what made unsupported/short input come out as "English".
 */
export async function detectLanguage(text: string, options: DetectOptions = {}): Promise<Detection> {
  const hints = options.hints ?? []
  const sample = cleanForDetection(text).slice(0, 2000)
  if (!sample) return { language: null, confidence: 0, source: null }

  const byScript = detectByScript(sample, hints)
  if (byScript) return { language: byScript, confidence: 1, source: 'script' }

  try {
    const detector = await getDetector()
    const results = await detector.detect(sample, { signal: options.signal })
    return pickFromModel(results, hints)
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    if ((err as Error)?.name === 'NotAllowedError') throw new TranslateError('needs-activation', 'The language detection model must be downloaded first')
    console.warn('[translate-me] Language detection failed', err)
    // Model unavailable: a hint is still better than nothing for Latin text.
    return hints[0] ? { language: hints[0], confidence: 0, source: 'hint' } : { language: null, confidence: 0, source: null }
  }
}

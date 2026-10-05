/* ══════════════════════════════════════════════════════════════
   ipa.js — 音標引擎
   1) 內建 A2 高頻「功能詞」音標表（句子的骨架詞）
   2) 開場時把各場景的單字／片語音標註冊進全域字典
   3) 用最長匹配把整句組出音標；任一個字查不到就整句不顯示（寧可不出，也不要錯）
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ───────── 功能詞音標（英式，不含前後斜線） ───────── */
  var FUNCTION_IPA = {
    // 冠詞與限定詞
    'a': 'ə', 'an': 'ən', 'the': 'ðə', 'this': 'ðɪs', 'that': 'ðæt',
    'these': 'ðiːz', 'those': 'ðəʊz', 'my': 'maɪ', 'your': 'jɔː', 'his': 'hɪz',
    'her': 'hɜː', 'its': 'ɪts', 'our': 'ˈaʊə', 'their': 'ðeə',
    'some': 'sʌm', 'any': 'ˈen.i', 'no': 'nəʊ', 'every': 'ˈev.ri', 'each': 'iːtʃ',
    'both': 'bəʊθ', 'all': 'ɔːl', 'many': 'ˈmen.i', 'much': 'mʌtʃ', 'few': 'fjuː',
    'several': 'ˈsev.ɚ.əl', 'enough': 'ɪˈnʌf', 'another': 'əˈnʌ.ðə',
    'other': 'ˈʌ.ðə', 'same': 'seɪm', 'own': 'əʊn',
    // 人稱代名詞
    'i': 'ˈaɪ', 'you': 'juː', 'he': 'hiː', 'she': 'ʃiː', 'it': 'ɪt',
    'we': 'wiː', 'they': 'ðeɪ', 'me': 'miː', 'him': 'hɪm', 'us': 'ʌs',
    'them': 'ðəm', 'who': 'huː', 'whom': 'huːm', 'whose': 'huːz',
    'what': 'wɒt', 'which': 'wɪtʒ', 'whatever': 'wɒtˈev.ə',
    'myself': 'maɪˈself', 'himself': 'ɪmˈself', 'herself': 'hɜːˈself',
    'themselves': 'ðəmˈselvz', 'ourselves': 'aʊəˈselvz',
    'everyone': 'ˈev.ri.wʌn', 'everybody': 'ˈev.ri.bɒd.i',
    'someone': 'ˈsʌm.wʌn', 'somebody': 'ˈsʌm.bɒd.i',
    'something': 'ˈsʌm.θɪŋ', 'anything': 'ˈen.i.θɪŋ', 'nothing': 'ˈnʌθ.ɪŋ',
    'nobody': 'ˈnəʊ.bɒd.i',
    // be 動詞與助動詞
    'am': 'æm', 'is': 'ɪz', 'are': 'ɑː', 'was': 'wɒz', 'were': 'wɜː',
    'be': 'biː', 'been': 'bɪn', 'being': 'ˈbiː.ɪŋ',
    'do': 'duː', 'does': 'dʌz', 'did': 'dɪd', 'done': 'dʌn', 'doing': 'ˈduː.ɪŋ',
    'have': 'hæv', 'has': 'hæz', 'had': 'hæd', 'having': 'ˈhæv.ɪŋ',
    'will': 'wɪl', 'would': 'wɜː', 'shall': 'ʃæl', 'should': 'ʃʊd',
    'can': 'kæn', 'could': 'kʊd', 'may': 'meɪ', 'might': 'maɪt', 'must': 'mʌst',
    // 常見縮寫
    "don't": 'dəʊnt', "doesn't": 'ˈdʌz.ənt', "didn't": 'ˈdɪd.ənt',
    "can't": 'kɑːnt', 'cannot': 'ˈkæn.ɒt', "won't": 'wəʊnt', "shan't": 'ʃɑːnt',
    "isn't": 'ˈɪz.ənt', "aren't": 'ˈɑː.ənt', "wasn't": 'ˈwɒz.ənt',
    "weren't": 'ˈwɜː.ənt', "haven't": 'ˈhæv.ənt', "hasn't": 'ˈhæz.ənt',
    "hadn't": 'ˈhæd.ənt', "shouldn't": 'ˈʃʊd.ənt', "wouldn't": 'ˈwʊd.ənt',
    "couldn't": 'ˈkʊd.ənt', "mightn't": 'ˈmaɪt.ənt',
    "i'm": 'aɪm', "i've": 'aɪv', "i'll": 'aɪl', "i'd": 'aɪd',
    "you're": 'jɔː', "you've": 'juːv', "you'll": 'juːl', "you'd": 'juːd',
    "he's": 'hiːz', "she's": 'ʃiːz', "it's": 'ˈɪts', "we're": 'ˈwɪə',
    "we'll": 'ˈwɪl', "we've": 'ˈwɪv', "they're": 'ˈðeə', "they'll": 'ˈðeɪl',
    "they've": 'ˈðeɪv', "that's": 'ðæts', "there's": 'ðeəz',
    "here's": 'hɪəz', "what's": 'wɒts', "let's": 'lets',
    // 介系詞
    'of': 'əv', 'in': 'ɪn', 'on': 'ɒn', 'at': 'æt', 'to': 'tuː', 'tu': 'tuː',
    'for': 'fɔː', 'with': 'wɪð', 'from': 'frɌm', 'by': 'baɪ', 'about': 'əˈbaʊt',
    'into': 'ˈɪn.tuː', 'onto': 'ˈɒn.tuː', 'off': 'ɒf', 'up': 'ʌp', 'down': 'daʊn',
    'over': 'ˈəʊ.və', 'under': 'ˈʌn.də', 'above': 'əˈbʌv', 'below': 'bɪˈləʊ',
    'behind': 'bɪˈhaɪnd', 'beside': 'bɪˈsaɪd', 'between': 'bɪˈtwiːn',
    'through': 'θruː', 'across': 'əˈkrɒs', 'around': 'əˈraʊnd',
    'along': 'əˈlɒŋ', 'near': 'nɪr', 'next': 'nekst', 'behind': 'bɪˈhaɪnd',
    'without': 'wɪˈðaʊt', 'inside': 'ɪnˈsaɪd', 'outside': 'ˌaʊtˈsaɪd',
    'towards': 'təˈwɔːdz', 'toward': 'təˈwɔːd', 'during': 'ˈdjʊə.rɪŋ',
    'until': 'ənˈtɪl', 'against': 'əˈɡenst', 'among': 'əˈmʌŋ', 'beside': 'bɪˈsaɪd',
    // 連接詞與其他
    'and': 'ənd', 'or': 'ɔː', 'but': 'bʌt', 'so': 'səʊ', 'if': 'ɪf',
    'because': 'bɪˈkɒːz', 'although': 'ɔːlˈðəʊ', 'though': 'ðəʊ',
    'while': 'waɪl', 'when': 'wen', 'where': 'weə', 'why': 'waɪ',
    'how': 'haʊ', 'than': 'ðæn', 'as': 'əz', 'until': 'ənˈtɪl',
    'unless': 'ənˈles', 'however': 'haʊˈev.ə', 'also': 'ˈɔːl.səʊ',
    'not': 'nɒt', 'never': 'ˈnev.ə', 'always': 'ˈɔːl.weɪz', 'often': 'ˈɒf.ən',
    'sometimes': 'ˈsʌm.taɪmz', 'usually': 'ˈjuː.ʒu.əl.i', 'again': 'əˈɡen',
    'here': 'hɪə', 'there': 'ðeə', 'now': 'naʊ', 'then': 'ðen', 'today': 'təˈdeɪ',
    'together': 'təˈɡeð.ə', 'perhaps': 'pəˈhæps', 'maybe': 'ˈmeɪ.bi',
    'please': 'pliːz', 'yes': 'jes', 'ok': 'ˌəʊˈkeɪ', 'okay': 'ˌəʊˈkeɪ',
    // 高頻名詞（句子裡最常見的）
    'time': 'taɪm', 'day': 'deɪ', 'week': 'wiːk', 'month': 'mʌnθ', 'year': 'jɪə',
    'hour': 'ˈaʊə', 'minute': 'ˈmɪn.ɪt', 'second': 'ˈsek.ənd', 'moment': 'ˈməʊ.mənt',
    'morning': 'ˈmɔː.nɪŋ', 'afternoon': 'ˌɑːf.təˈnuːn', 'evening': 'ˈiːv.nɪŋ',
    'night': 'naɪt', 'weekend': 'ˌwiːkˈend', 'people': 'ˈpiː.pəl',
    'person': 'ˈpɜː.sən', 'friend': 'frend', 'family': 'ˈfæm.əl.i',
    'home': 'həʊm', 'house': 'haʊs', 'school': 'skuːl', 'class': 'klɑːs',
    'student': 'ˈstuː.dənt', 'teacher': 'ˈtiː.tʃə', 'name': 'neɪm',
    'question': 'ˈkwes.tʃən', 'problem': 'ˈprɒb.ləm', 'idea': 'aɪˈdɪə',
    'number': 'ˈnʌm.bə', 'place': 'pleɪs', 'part': 'pɑːt', 'side': 'saɪd',
    'end': 'end', 'life': 'laɪf', 'world': 'wɜːld', 'money': 'ˈmʌn.i',
    'food': 'fuːd', 'car': 'kɑː', 'bus': 'bʌs', 'train': 'treɪn',
    'phone': 'fəʊn', 'letter': 'ˈlet.ə', 'email': 'ˈiː.meɪl',
    'message': 'ˈmes.ɪdʒ', 'picture': 'ˈpɪk.tʃə', 'film': 'fɪlm', 'game': 'ɡeɪm',
    'music': 'ˈmjuː.zɪk', 'song': 'sɒŋ', 'shop': 'ʃɒp', 'price': 'praɪs',
    'bill': 'bɪl', 'water': 'ˈwɔː.tə', 'food': 'fuːd', 'city': 'ˈsɪt.i',
    'country': 'ˈkʌn.tri', 'place': 'pleɪs', 'work': 'wɜːk', 'job': 'dʒɒb',
    'thing': 'θɪŋ', 'way': 'weɪ', 'lot': 'lɒt',
    // 高頻動詞
    'go': 'ɡəʊ', 'come': 'kʌm', 'get': 'ɡet', 'make': 'meɪk', 'take': 'teɪk',
    'give': 'ɡɪv', 'put': 'pʊt', 'find': 'faɪnd', 'think': 'θɪŋk',
    'know': 'nəʊ', 'see': 'siː', 'look': 'lʊk', 'want': 'wɒnt',
    'use': 'juːz', 'like': 'laɪk', 'work': 'wɜːk', 'play': 'pleɪ',
    'need': 'niːd', 'help': 'help', 'try': 'traɪ', 'ask': 'ɑːsk',
    'call': 'kɔːl', 'feel': 'fiːl', 'become': 'bɪˈkʌm', 'leave': 'liːv',
    'put': 'pʊt', 'mean': 'miːn', 'let': 'let', 'begin': 'bɪˈɡɪn',
    'keep': 'kiːp', 'seem': 'siːm', 'talk': 'tɔːk', 'turn': 'tɜːn',
    'start': 'stɑːt', 'show': 'ʃəʊ', 'hear': 'hɪə', 'play': 'pleɪ',
    'run': 'rʌn', 'move': 'muːv', 'live': 'lɪv', 'believe': 'bɪˈliːv',
    'bring': 'brɪŋ', 'happen': 'ˈhæp.ən', 'write': 'raɪt', 'provide': 'prəˈvaɪd',
    'sit': 'sɪt', 'stand': 'stænd', 'lose': 'luːz', 'pay': 'peɪ',
    'meet': 'miːt', 'include': 'ɪnˈkluːd', 'continue': 'kənˈtɪn.juː',
    'set': 'set', 'learn': 'lɜːn', 'change': 'tʃeɪndʒ', 'lead': 'liːd',
    'understand': 'ˌʌn.dəˈstænd', 'watch': 'wɒtʃ', 'follow': 'ˈfɒl.əʊ',
    'stop': 'stɒp', 'create': 'kriˈeɪt', 'speak': 'spiːk', 'read': 'riːd',
    'allow': 'əˈlaʊ', 'add': 'æd', 'spend': 'spend', 'grow': 'ɡrəʊ',
    'open': 'ˈəʊ.pən', 'walk': 'wɔːk', 'win': 'wɪn', 'offer': 'ˈɒf.ə',
    'remember': 'rɪˈmem.bə', 'love': 'lʌv', 'consider': 'kənˈsɪd.ə',
    'appear': 'əˈpɪə', 'buy': 'baɪ', 'wait': 'weɪt', 'serve': 'sɜːv',
    'die': 'daɪ', 'send': 'send', 'expect': 'ɪkˈspekt', 'build': 'bɪld',
    'stay': 'steɪ', 'fall': 'fɔːl', 'cut': 'kʌt', 'reach': 'riːtʃ',
    'kill': 'kɪl', 'remain': 'rɪˈmeɪn', 'suggest': 'səˈdʒest', 'raise': 'reɪz',
    'pass': 'pɑːs', 'sell': 'sel', 'require': 'rɪˈkwaɪə', 'report': 'rɪˈpɔːt',
    'decide': 'dɪˈsaɪd', 'pull': 'pʊl', 'return': 'rɪˈtɜːn', 'explain': 'ɪkˈspleɪn',
    'hope': 'həʊp', 'develop': 'dɪˈvel.əp', 'carry': 'ˈker.i',
    'break': 'breɪk', 'receive': 'rɪˈsiːv', 'agree': 'əˈɡriː',
    'support': 'səˈpɔːt', 'hit': 'hɪt', 'eat': 'iːt', 'cover': 'ˈkʌv.ə',
    'catch': 'kætʃ', 'draw': 'drɔː', 'choose': 'tʃuːz', 'cause': 'kɔːz',
    'point': 'pɔɪnt', 'listen': 'ˈlɪs.ən', 'realise': 'ˈrɪə.laɪz',
    'change': 'tʃeɪndʒ', 'close': 'kləʊs', 'speak': 'spiːk',
    // 常用形容詞／副詞
    'good': 'ɡʊd', 'bad': 'bæd', 'big': 'bɪɡ', 'small': 'smɔːl',
    'new': 'njuː', 'old': 'əʊld', 'young': 'jʌŋ', 'long': 'lɒŋ',
    'short': 'ʃɔːt', 'high': 'haɪ', 'low': 'ləʊ', 'hot': 'hɒt',
    'cold': 'kəʊld', 'warm': 'wɔːm', 'cool': 'kuːl', 'happy': 'ˈhæp.i',
    'tired': 'ˈtaɪəd', 'easy': 'ˈiː.zi', 'difficult': 'ˈdɪf.ɪ.kəlt',
    'beautiful': 'ˈbjuː.tɪ.fəl', 'nice': 'naɪs', 'best': 'best', 'better': 'ˈbet.ə',
    'right': 'raɪt', 'wrong': 'rɒŋ', 'true': 'truː', 'also': 'ˈɔːl.səʊ',
    'very': 'ˈver.i', 'too': 'tuː', 'quite': 'kwaɪt', 'really': 'ˈrɪə.li',
    'much': 'mʌtʃ', 'more': 'mɔː', 'most': 'məʊst', 'less': 'les',
    'enough': 'ɪˈnʌf', 'only': 'ˈəʊn.li', 'just': 'dʒʌst', 'still': 'stɪl',
    'already': 'ɔːlˈredi', 'soon': 'suːn', 'late': 'leɪt', 'early': 'ˈɜː.li',
    'always': 'ˈɔːl.weɪz', 'never': 'ˈnev.ə', 'often': 'ˈɒf.ən',
    'because': 'bɪˈkɒːz', 'before': 'bɪˈfɔː', 'after': 'ˈɑːf.tə',
    'while': 'waɪl', 'every': 'ˈev.ri', 'first': 'fɜːst', 'last': 'lɑːst',
    'next': 'nekst', 'other': 'ˈʌ.ðə', 'another': 'əˈnʌ.ðə', 'same': 'seɪm'
  };

  /* ───────── 不規則變化補丁 ─────────
     句子裡最常出現、卻無法用規則推導的字形（不規則過去式、不規則複數、
     數字、專有名詞…）。補上之後句子音標的組合率才會夠高。 */
  var IRREGULAR_IPA = {
    'two': 'tuː', 'three': 'θriː', 'four': 'fɔː', 'five': 'faɪv', 'six': 'sɪks',
    'seven': 'ˈsev.ən', 'eight': 'eɪt', 'nine': 'naɪn', 'ten': 'ten',
    'eleven': 'ɪˈlev.ən', 'twelve': 'twelv', 'thirteen': 'ˌθɜːˈtiːn',
    'thirty': 'ˈθɜː.ti', 'fifty': 'ˈfɪf.ti', 'hundred': 'ˈhʌn.drəd',
    'thousand': 'ˈθaʊ.zənd', 'million': 'ˈmɪl.jən', 'kilo': 'ˈkiː.ləʊ',
    'kilos': 'ˈkiː.ləʊz', 'zero': 'ˈzɪə.rəʊ', 'first': 'fɜːst',
    'third': 'θɜːd', 'fourth': 'fɔːθ', 'fifth': 'fɪfθ',

    'bought': 'bɔːt', 'made': 'meɪd', 'gave': 'ɡeɪv', 'took': 'tʊk',
    'said': 'sed', 'went': 'went', 'broke': 'brəʊk', 'won': 'wʌn',
    'told': 'təʊld', 'got': 'ɡɒt', 'felt': 'felt', 'fell': 'fel',
    'ate': 'et', 'forgot': 'fəˈɡɒt', 'saw': 'sɔː', 'met': 'met',
    'found': 'faʊnd', 'paid': 'peɪd', 'became': 'bɪˈkeɪm', 'heard': 'hɜːd',
    'came': 'keɪm', 'grew': 'ɡruː', 'hid': 'hɪd', 'kept': 'kept',
    'slept': 'slept', 'wore': 'wɔː', 'drank': 'dræŋk', 'froze': 'frəʊz',
    'began': 'bɪˈɡæn', 'held': 'held', 'rang': 'reɪŋ', 'taught': 'tɔːt',
    'learnt': 'lɜːnt', 'knew': 'njuː', 'wrote': 'raɪt', 'threw': 'θruː',
    'drove': 'drəʊv', 'spent': 'spent', 'burnt': 'bɜːnt', 'built': 'bɪlt',
    'brought': 'brɔːt', 'caught': 'kɔːt', 'chose': 'tʃuːz', 'drew': 'druː',
    'fought': 'fɔːt', 'hung': 'hʌŋ', 'led': 'led', 'lent': 'lent',
    'lost': 'lɒst', 'meant': 'ment', 'rode': 'rəʊd', 'rose': 'rəʊz',
    'sold': 'səʊld', 'sent': 'sent', 'shook': 'ʃʊk', 'shot': 'ʃɒt',
    'shut': 'ʃʌt', 'sang': 'sæŋ', 'sank': 'sæŋk', 'sat': 'sæt',
    'spoke': 'spəʊk', 'stood': 'stʊd', 'thought': 'θɔːt',
    'understood': 'ˌʌn.dəˈstʊd', 'woke': 'wəʊk', 'laid': 'leɪd',
    'dealt': 'delt', 'swam': 'swɒm', 'struck': 'strʌk',

    'goes': 'ɡəʊz', 'does': 'dʌz', 'says': 'sez',
    'watches': 'ˈwɒtʃ.ɪz', 'makes': 'meɪks', 'writes': 'raɪts',
    'takes': 'ˈteɪ.kɪz', 'rides': 'ˈraɪ.dɪz', 'likes': 'laɪks',
    'loves': 'lʌvz', 'moves': 'muːvz', 'serves': 'ˈsɜː.vɪz',
    'drives': 'draɪvz', 'closes': 'ˈkləʊ.zɪz', 'arrives': 'əˈraɪvz',
    'cycles': 'ˈsaɪ.kəlz', 'comes': 'kʌmz', 'rises': 'ˈraɪ.zɪz',
    'hides': 'haɪdz', 'burns': 'bɜːnz', 'behaves': 'bɪˈheɪvz',
    'hates': 'heɪts', 'prefers': 'prɪˈfɜːz', 'dances': 'ˈdɑːn.sɪz',
    'laughs': 'lɑːfs', 'talks': 'tɔːks', 'washes': 'ˈwɒʃ.ɪz',
    'teaches': 'ˈtiː.tʃ.ɪz', 'listens': 'ˈlɪs.ənz', 'hopes': 'həʊps',
    'needs': 'niːdz', 'opens': 'ˈəʊ.pənz', 'starts': 'stɑːts',
    'wants': 'ˈwɒnts', 'plays': 'pleɪz', 'shows': 'ʃəʊz',
    'knows': 'nəʊz', 'uses': 'ˈjuː.zɪz', 'reads': 'riːdz',
    'sings': 'sɪŋz', 'brings': 'brɪŋz', 'thinks': 'θɪŋks',
    'eats': 'iːts', 'drinks': 'drɪŋks', 'lives': 'laɪvz',

    'teeth': 'tiːθ', 'feet': 'fiːt', 'mice': 'maɪs', 'geese': 'ɡiːs',
    'children': 'ˈtʃɪl.drən', 'women': 'ˈwɪm.ɪn', 'men': 'men',
    'photos': 'ˈfəʊ.təʊz', 'eyes': 'aɪz', 'potatoes': 'pəˈteɪ.təʊz',
    'tomatoes': 'təˈmɑː.təʊz', 'vegetables': 'ˈvedʒ.tə.bəlz',
    'apples': 'ˈæp.əlz', 'bees': 'biːz', 'bottles': 'ˈbɒt.əlz',
    'gloves': 'ɡlʌvz', 'grapes': 'ɡreɪps', 'kilometres': 'ˈkɪl.ə.miː.təz',
    'magazines': 'ˌmæɡ.əˈziːnz', 'notes': 'nəʊts',
    'pictures': 'ˈpɪk.tʃəz', 'games': 'ɡeɪmz', 'cameras': 'ˈkæm.ə.rəz',
    'times': 'taɪmz', 'minutes': 'ˈmɪn.ɪts', 'prices': 'ˈpraɪ.sɪz',
    'sales': 'seɪlz', 'sentences': 'ˈsen.tən.sɪz', 'mistakes': 'mɪˈsteɪks',
    'classes': 'ˈklɑː.sɪz', 'boxes': 'ˈbɒk.sɪz', 'dishes': 'ˈdɪʃ.ɪz',
    'countries': 'ˈkʌn.triz', 'cities': 'ˈsɪt.iz',
    'families': 'ˈfæm.ə.liz', 'babies': 'ˈbeɪ.biz', 'stories': 'ˈstɔː.riz',
    'giraffes': 'dʒəˈrɑː.fɪz', 'whales': 'weɪlz', 'giraffe': 'dʒəˈrɑːf',
    'whale': 'weɪl', 'crocodiles': 'ˈkrɒk.ə.daɪlz',
    'crocodile': 'ˈkrɒk.ə.daɪl', 'snakes': 'sneɪks', 'snake': 'sneɪk',
    'vitamins': 'ˈvɪt.ə.mɪnz', 'vitamin': 'ˈvɪt.ə.mɪn',
    'ones': 'wʌnz',

    'london': 'ˈlʌn.dən', 'paris': 'ˈpær.ɪs', 'tom': 'tɒm', 'chen': 'tʃen',
    'anna': 'ˈæn.ə', 'tv': 'ˌtiːˈviː', 'america': 'əˈmer.ɪ.kə',
    'britain': 'ˈbrɪt.ən', 'japan': 'dʒəˈpæn', 'china': 'ˈtʃaɪ.nə',
    'brazil': 'brəˈzɪl', 'canada': 'ˈkæn.ə.də', 'france': 'frɑːns',
    'ireland': 'ˈaɪə.lənd', 'india': 'ˈɪn.di.ə', 'italy': 'ˈɪt.ə.li',
    'spain': 'speɪn', 'australia': 'ɔːˈstreɪ.li.ə',
    'germany': 'ˈdʒɜː.mə.ni', 'africa': 'ˈæf.rɪ.kə',
    'antarctica': 'ˌæn.tɑːkˈtɪ.kə', 'asia': 'ˈeɪ.ʒə', 'europe': 'ˈjʊə.rəʊp',

    'credit': 'ˈkred.ɪt', 'scheme': 'skiːm', 'main': 'meɪn',
    'cough': 'kɒf', 'social': 'ˈsəʊ.ʃəl', 'media': 'ˈmiː.di.ə',
    'edge': 'edʒ', 'primary': 'ˈpraɪ.mər.i', 'continent': 'ˈkɒn.tɪ.nənt',
    'largest': 'ˈlɑː.dʒɪst', 'uncomfortable': 'ʌnˈkʌm.fə.tə.bəl',
    'bitter': 'ˈbɪt.ə', 'degrees': 'dɪˈɡriːz', 'solve': 'sɒlv',
    'connected': 'kəˈnek.tɪd', 'languages': 'ˈlæŋ.ɡwɪdʒ.ɪz',
    'shining': 'ˈʃaɪ.nɪŋ', 'loudly': 'ˈlaʊd.li', 'quietly': 'ˈkwaɪ.ət.li',
    'completely': 'kəmˈpliːt.li', 'honestly': 'ˈɒn.ɪst.li',
    'congratulations': 'kənˌɡræt.jəˈleɪ.ʃəns',
    'recycling': 'ˌriːˈsaɪ.klɪŋ', 'terminal': 'ˈtɜː.mɪ.nəl',
    'badge': 'bædʒ', 'pram': 'præm', 'frame': 'freɪm',
    'suitable': 'ˈsuː.tə.bəl', 'bigger': 'ˈbɪɡ.ə', 'touch': 'tʌtʃ',
    'prefer': 'prɪˈfɜː',
    'clap': 'klæp', 'bark': 'bɑːk', 'charge': 'tʃɑːdʒ', 'expire': 'ɪkˈspaɪə',
    'renew': 'rɪˈnjuː', 'burn': 'bɜːn', 'asleep': 'əˈslæp', 'voice': 'vɔɪs',
    'nil': 'nɪl', 't': 'tiː', 'award': 'əˈwɔːd', 'cheer': 'tʃɪə',
    'brush': 'brʌʃ', 'climb': 'klaɪm', 'count': 'kaʊnt', 'miss': 'mɪs',
    'cross': 'krɒs', 'waste': 'weɪst', 'repair': 'rɪˈpeə', 'delay': 'dɪˈleɪ', 'tonight': 'təˈnaɪt', 'tomorrow': 'təˈmɒr.əʊ',
    'yesterday': 'ˈjes.tə.deɪ', 'today': 'təˈdeɪ'
  };

  /* 多字片語（補丁） */
  var EXTRA_PHRASES = {
    'social media': 'ˈsəʊ.ʃəl ˈmiː.di.ə',
    'remote control': 'rɪˌməʊt kənˈtrəʊl',
    'tv remote': 'ˌtiːˈviː rɪˌməʊt',
    'credit card': 'ˈkred.ɪt kɑːd',
    'staff': 'stɑːf'
  };

  var dict = Object.create(null);   // 小寫 → ipa
  var phrases = [];                 // 多字片語（依長度遞減，用來最長匹配）
  var maxPhraseWords = 1;

  function key(s) { return String(s || '').toLowerCase().replace(/[’‘]/g, "'").trim(); }

  function registerWord(en, ipa) {
    if (!en || !ipa) return;
    var k = key(en);
    if (!k || dict[k]) return;
    dict[k] = ipa;
    var n = k.split(/\s+/).length;
    if (n > 1) {
      phrases.push(k);
      if (n > maxPhraseWords) maxPhraseWords = n;
      phrases.sort(function (a, b) { return b.split(/\s+/).length - a.split(/\s+/).length; });
    }
  }

  function registerScene(scene) {
    ['words', 'phrases'].forEach(function (key2) {
      (scene[key2] || []).forEach(function (it) { registerWord(it.en, it.ipa); });
    });
  }

  function registerAll(scenes) { (scenes || []).forEach(registerScene); }

  /* ───────── 詞形變化：讓 "books" / "studied" 也能查到 ───────── */
  var VOWELS = 'aeiou';

  function isVowel(ch) { return VOWELS.indexOf(ch) >= 0; }

  function lookupToken(tok) {
    var k = key(tok);
    if (!k) return null;
    if (dict[k]) return dict[k];

    // 所有格：today's / teacher's / everyone's
    if (/'s$/.test(k)) {
      var own = lookupToken(k.slice(0, -2));
      if (own) return own + 'z';
    }

    // 複數 / 第三人稱單數：book → books, leave → leaves, watch → watches,
    // baby → babies, box → boxes
    if (/s$/.test(k) && !/(ss|us|is)$/.test(k)) {
      if (dict[k.slice(0, -1)]) return dict[k.slice(0, -1)];
      if (/es$/.test(k)) {
        var st = k.slice(0, -2);
        if (dict[st]) return dict[st];
        if (dict[st + 'e']) return dict[st + 'e'];
      }
    }
    if (/ies$/.test(k) && dict[k.slice(0, -3) + 'y']) return dict[k.slice(0, -3) + 'y'];

    // 過去式 / 過去分詞：walk → walked, study → studied, stop → stopped
    if (/ied$/.test(k) && dict[k.slice(0, -3) + 'y']) return dict[k.slice(0, -3) + 'y'];
    if (/ed$/.test(k)) {
      var stem = k.slice(0, -2);
      if (dict[stem]) return dict[stem];
      if (dict[stem + 'e']) return dict[stem + 'e'];          // like → liked
      if (dict[stem.slice(0, -1)]) {                            // stop → stopped
        var base = stem.slice(0, -1);
        return dict[base] + (isVowel(base[base.length - 1]) ? 'ɪd' : 't');
      }
    }

    // 進行式：eating → eat, running → run
    if (/ing$/.test(k)) {
      var stem2 = k.slice(0, -3);
      if (dict[stem2]) return dict[stem2];
      if (dict[stem2 + 'e']) return dict[stem2 + 'e'];
      if (dict[stem2.slice(0, -1)]) return dict[stem2.slice(0, -1)] + 'ɪŋ';
    }

    // 比較級 / 最高級
    if (/er$/.test(k) && dict[k.slice(0, -2)]) return dict[k.slice(0, -2)];
    if (/est$/.test(k) && dict[k.slice(0, -3)]) return dict[k.slice(0, -3)];
    if (/ier$/.test(k) && dict[k.slice(0, -3) + 'y']) return dict[k.slice(0, -3) + 'y'];
    if (/iest$/.test(k) && dict[k.slice(0, -4) + 'y']) return dict[k.slice(0, -4) + 'y'];

    return null;
  }

  /* ───────── the / a 的連續發音 ───────── */
  var VOWEL_START = /^[aeiouæɑɒɔ]/i;

  function fixArticles(tokens, ipas, phraseHead) {
    for (var i = 0; i < tokens.length; i++) {
      // 片語（例如 "a glass of water"）的音標是整包給的，不能再改裡面的 a
      if (phraseHead && phraseHead[i]) continue;
      var t = key(tokens[i]);
      var next = i + 1 < tokens.length ? tokens[i + 1] : '';
      if (t === 'a') ipas[i] = VOWEL_START.test(next) ? 'eɪ' : 'ə';
      else if (t === 'an') ipas[i] = 'ən';
      else if (t === 'the') ipas[i] = VOWEL_START.test(next) ? 'ði' : 'ðə';
      else if (t === 'to' && /^ˈtuː/.test(ipas[i] || '')) ipas[i] = 'tuː';
    }
  }

  /* 相鄰兩字都帶主要重音時，把後一個降成次要重音（避免 ˈ ˈ 相撞） */
  function relaxStress(ipas) {
    for (var i = 1; i < ipas.length; i++) {
      if (ipas[i] && ipas[i].charAt(0) === 'ˈ' &&
          ipas[i - 1] && ipas[i - 1].indexOf('ˈ') > -1) {
        ipas[i] = 'ˌ' + ipas[i].slice(1);
      }
    }
  }

  var TOKEN_RE = /([A-Za-z0-9'’]+)|([^A-Za-z0-9'\s]+)/g;

  function tokenize(text) {
    return text.match(TOKEN_RE) || [];
  }

  /**
   * 把整句組成音標。任何一個內容字查不到就回傳空字串（寧可不出，也不要出錯的音標）。
   * @returns {string} 例如 "ɪ ˈsteɪk ən ˈɔː.d ˈkʊp əv ˈkɔː.fi"
   */
  function compose(text) {
    if (!text) return '';
    var raw = tokenize(text);
    var words = [], isPunct = [];

    // 先把標點挑出來，剩下的純文字才做片語最長匹配
    raw.forEach(function (t) {
      var isWord = /[A-Za-z0-9'’]/.test(t);
      words.push(isWord ? t : null);
      isPunct.push(!isWord);
    });

    var plain = words.filter(Boolean);
    var ipas = new Array(plain.length);
    var phraseHead = new Array(plain.length);   // 該位置是否為多字片語的開頭
    var cursor = 0, covered = true;

    while (cursor < plain.length) {
      var hit = null, hitLen = 0;
      for (var n = Math.min(maxPhraseWords, plain.length - cursor); n >= 2; n--) {
        var cand = key(plain.slice(cursor, cursor + n).join(' '));
        if (dict[cand]) { hit = dict[cand]; hitLen = n; break; }
      }
      if (hit) {
        ipas[cursor] = hit;
        if (hitLen > 1) phraseHead[cursor] = true;
        for (var k = 1; k < hitLen; k++) ipas[cursor + k] = '';
        cursor += hitLen;
        continue;
      }
      var one = lookupToken(plain[cursor]);
      if (one) { ipas[cursor] = one; cursor++; }
      else { covered = false; break; }
    }

    if (!covered) return '';

    fixArticles(plain, ipas, phraseHead);
    relaxStress(ipas);

    return ipas.filter(function (x) { return x !== ''; }).join(' ');
  }

  /* 只用於單字／片語（詞庫本來就有 ipa，這裡是保險） */
  function ensureIpa(item) {
    return item.ipa || compose(item.en) || '';
  }

  global.Ipa = {
    registerWord: registerWord,
    registerScene: registerScene,
    registerAll: registerAll,
    compose: compose,
    tokenize: tokenize,
    ensureIpa: ensureIpa,
    size: function () { return Object.keys(dict).length; }
  };

  // 功能詞、不規則變化、片語補丁先登錄
  for (var fk in FUNCTION_IPA) registerWord(fk, FUNCTION_IPA[fk]);
  for (var ik in IRREGULAR_IPA) registerWord(ik, IRREGULAR_IPA[ik]);
  for (var pk in EXTRA_PHRASES) registerWord(pk, EXTRA_PHRASES[pk]);
})(window);

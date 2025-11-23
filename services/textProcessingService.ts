import { HumanizationLevel, WritingMode, AnalysisResult } from '../types';

// Heuristics for "AI-sounding" words
const AI_TRIGGER_WORDS = [
  "delve", "landscape", "tapestry", "nuance", "leverage", "utilize", 
  "harness", "unleash", "paramount", "crucial", "pivotal", "foster", 
  "game-changer", "transformative", "meticulous", "comprehensive", 
  "realm", "underscore", "highlight", "moreover", "furthermore", 
  "consequently", "seamlessly", "robust", "paradigm"
];

// Replacement dictionaries
const GENERAL_SYNONYMS: Record<string, string> = {
  "utilize": "use",
  "leverage": "use",
  "facilitate": "help",
  "demonstrate": "show",
  "subsequently": "later",
  "nevertheless": "but",
  "furthermore": "also",
  "moreover": "plus",
  "commence": "start",
  "terminate": "end",
  "endeavor": "try",
  "approximately": "about",
  "purchase": "buy",
  "require": "need",
  "obtain": "get",
  "seamlessly": "smoothly",
  "robust": "strong",
  "paramount": "key",
  "crucial": "vital",
  "unleash": "release",
  "harness": "control",
  "delve": "dig",
};

const PROFESSIONAL_SYNONYMS: Record<string, string> = {
  "get": "obtain",
  "buy": "purchase",
  "bad": "suboptimal",
  "good": "beneficial",
  "fix": "rectify",
  "ask": "inquire",
  "need": "require",
  "start": "initiate",
  "end": "conclude",
  "help": "assist",
  "try": "attempt",
  "use": "leverage",
  "maybe": "perhaps",
  "really": "significantly",
  "very": "highly",
  "think": "believe",
  "make": "generate",
  "give": "provide",
  "keep": "maintain",
  "show": "demonstrate",
  "tell": "inform",
  "fast": "expedited",
  "slow": "gradual",
  "change": "modify",
  "idea": "concept",
  "problem": "challenge",
  "result": "outcome",
};

const GENERAL_SUGGESTIONS = [
  "Use contractions (e.g., 'don't', 'can't') to sound more conversational.",
  "Inject personal anecdotes or 'I' statements to add warmth.",
  "Use sensory details (sight, sound, smell) to make descriptions vivid.",
  "Express uncertainty or opinion (e.g., 'I think', 'maybe') to sound human.",
  "Add a touch of humor or wit if appropriate.",
  "Use idioms or colloquialisms to sound less robotic.",
  "Show, don't just tell. Describe the experience.",
  "Avoid being overly objective; show some bias or preference.",
  "Use emotional adjectives to convey feeling.",
  "Address the reader directly as 'you'.",
  "Sound less authoritative and more collaborative.",
  "Read the text aloud to check for natural rhythm.",
  "Imagine you are explaining this to a friend over coffee.",
  "Remove unnecessary filler words that don't add meaning.",
  "Check for repetitive patterns in your writing.",
  "Ensure your conclusion doesn't start with 'In conclusion'.",
  "Mix short, punchy sentences with longer, descriptive ones.",
  "Start some sentences with conjunctions like 'But' or 'And'.",
  "Break up long paragraphs to improve readability.",
  "Try asking a rhetorical question to engage the reader.",
  "Vary your sentence openings; don't start every sentence with 'The' or 'It'.",
  "Use an em-dash (—) to add a conversational pause.",
  "Invert sentence structure occasionally for emphasis.",
  "Combine two short choppy sentences into one flowing thought.",
  "Split a complex compound sentence into two simpler ones."
];

const SPECIFIC_SUGGESTIONS: Record<string, string> = {
  "utilize": "Replace 'utilize' with 'use' for a more natural tone.",
  "leverage": "Avoid 'leverage' when 'use' or 'take advantage of' works better.",
  "paramount": "Swap 'paramount' for 'key' or 'important'.",
  "delve": "Instead of 'delve', try 'dig' or 'explore'.",
  "facilitate": "Use simpler alternatives for 'facilitate', like 'help'.",
  "moreover": "Avoid overusing transition words like 'moreover'.",
  "furthermore": "Cut 'furthermore' to sound less academic.",
  "commence": "Replace 'commence' with 'start' to sound less formal.",
  "purchase": "Use 'buy' instead of 'purchase' in casual contexts.",
  "demonstrate": "Change 'demonstrate' to 'show' for better flow.",
  "seamlessly": "Avoid 'seamlessly' unless describing actual seams; use 'smoothly'.",
  "meticulous": "Replace 'meticulous' with 'careful' or 'detailed'.",
  "endeavor": "Swap 'endeavor' for 'try'.",
  "approximately": "Use 'about' instead of 'approximately'.",
  "unleash": "Avoid 'unleash' unless talking about a physical restraint.",
  "harness": "Change 'harness' to 'use' or 'control'.",
  "landscape": "Avoid using 'landscape' metaphorically.",
  "tapestry": "Avoid 'tapestry' unless discussing textiles.",
  "nuance": "Use 'detail' or 'subtlety' instead of 'nuance'.",
  "pivotal": "Swap 'pivotal' for 'crucial' or 'central'.",
  "foster": "Use 'encourage' or 'build' instead of 'foster'.",
  "transformative": "Avoid 'transformative' unless it's a major change.",
  "realm": "Use 'area' or 'field' instead of 'realm'.",
  "underscore": "Use 'emphasize' or 'show' instead of 'underscore'.",
  "highlight": "Use 'point out' instead of 'highlight'."
};

// Helper to count stats
export const getStats = (text: string) => {
  const chars = text.length;
  const cjkCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const nonCjkText = text.replace(/[\u4e00-\u9fa5]/g, ' ');
  const spaceSeparatedCount = nonCjkText.trim() === '' ? 0 : nonCjkText.trim().split(/\s+/).length;
  const words = cjkCount + spaceSeparatedCount;
  const sentences = text.split(/[.!?。！？]+/).filter(s => s.trim().length > 0).length;
  return { chars, words, sentences };
};

// Mock Analysis Logic
export const analyzeText = (text: string): AnalysisResult => {
  const stats = getStats(text);
  if (stats.words === 0) {
    return {
      aiScore: 0,
      readabilityScore: 100,
      wordCount: 0,
      sentenceCount: 0,
      suggestions: [],
      flaggedPhrases: []
    };
  }

  let aiTriggersFound = 0;
  const flaggedPhrases: { phrase: string; reason: string }[] = [];
  const lowerText = text.toLowerCase();

  AI_TRIGGER_WORDS.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const match = text.match(regex);
    if (match) {
      aiTriggersFound += match.length;
      if (!flaggedPhrases.find(p => p.phrase === word)) {
        flaggedPhrases.push({ phrase: word, reason: "Commonly overused by AI." });
      }
    }
  });

  // Calculate Sentence Variance (AI tends to be very uniform)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).length);
  const avgLength = sentenceLengths.reduce((a, b) => a + b, 0) / (sentenceLengths.length || 1);
  const variance = sentenceLengths.reduce((a, b) => a + Math.pow(b - avgLength, 2), 0) / (sentenceLengths.length || 1);
  
  // Improved Scoring Logic
  // 1. Base score from triggers count (direct impact)
  let aiScoreRaw = aiTriggersFound * 15; 
  
  // 2. Density factor (triggers per word) - scales up for shorter texts with triggers
  aiScoreRaw += (aiTriggersFound / stats.words) * 1000;

  // 3. Variance adjustments
  if (variance < 5) aiScoreRaw += 30;      // Extremely robotic
  else if (variance < 12) aiScoreRaw += 15; // Very uniform
  else if (variance > 50) aiScoreRaw -= 20; // Very human
  else if (variance > 35) aiScoreRaw -= 10; // Human-ish

  // 4. Length penalty (very short text is hard to judge, bias towards neutral/low unless triggers found)
  if (stats.words < 30 && aiTriggersFound === 0) aiScoreRaw = 0;

  const aiScore = Math.min(Math.max(Math.round(aiScoreRaw), 5), 99);
  const readabilityScore = Math.max(100 - (avgLength * 2), 10); // Simple heuristic

  const suggestions: string[] = [];
  
  // 1. Specific Trigger-based suggestions
  flaggedPhrases.forEach(fp => {
      const suggestion = SPECIFIC_SUGGESTIONS[fp.phrase.toLowerCase()];
      if (suggestion && !suggestions.includes(suggestion)) {
          suggestions.push(suggestion);
      }
  });

  // 2. Score/Stat based
  if (variance < 15) suggestions.push("Vary your sentence structure. Mix short and long sentences.");
  if (avgLength > 25) suggestions.push("Your sentences are quite long. Try breaking them up.");
  if (stats.words < 20) suggestions.push("Text is too short for accurate analysis.");
  
  // 3. General Suggestions (Fill up to 5 if needed)
  if (suggestions.length < 5) {
      const shuffled = [...GENERAL_SUGGESTIONS].sort(() => 0.5 - Math.random());
      for (const s of shuffled) {
          if (suggestions.length >= 5) break;
          suggestions.push(s);
      }
  }

  return {
    aiScore,
    readabilityScore: Math.round(readabilityScore),
    wordCount: stats.words,
    sentenceCount: stats.sentences,
    suggestions,
    flaggedPhrases
  };
};

// Mock Humanization Logic
export const humanizeText = (
  text: string, 
  level: HumanizationLevel, 
  mode: WritingMode
): string => {
  let processedText = text;
  
  // 1. Word Replacement Strategy
  const dict = mode === WritingMode.General ? GENERAL_SYNONYMS : PROFESSIONAL_SYNONYMS;
  
  // Factor for how many words to replace based on level
  const replacementChance = level === HumanizationLevel.Light ? 0.3 : level === HumanizationLevel.Medium ? 0.6 : 0.9;

  Object.keys(dict).forEach(key => {
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    processedText = processedText.replace(regex, (match) => {
      return Math.random() < replacementChance ? dict[key] : match;
    });
  });

  // 2. Structural Changes (Heavy Level only)
  if (level === HumanizationLevel.Heavy) {
    const sentences = processedText.split('. ');
    
    if (mode === WritingMode.General) {
        processedText = sentences.map(s => {
            if (Math.random() < 0.25 && s.length > 10) {
                const fillers = ["Honestly,", "Basically,", "You know,", "Look,", "To be fair,", "Actually,"];
                const filler = fillers[Math.floor(Math.random() * fillers.length)];
                return `${filler} ${s.charAt(0).toLowerCase() + s.slice(1)}`;
            }
            return s;
        }).join('. ');
    } else if (mode === WritingMode.Professional) {
        processedText = sentences.map(s => {
            if (Math.random() < 0.2 && s.length > 15) {
                const transitions = ["Furthermore,", "Consequently,", "In addition,", "Moreover,", "Therefore,", "Notably,"];
                const trans = transitions[Math.floor(Math.random() * transitions.length)];
                return `${trans} ${s.charAt(0).toLowerCase() + s.slice(1)}`;
            }
            return s;
        }).join('. ');
    }
  }

  // 3. Contractions (General Mode only)
  if (mode === WritingMode.General) {
     processedText = processedText
        .replace(/\bcannot\b/gi, "can't")
        .replace(/\bdo not\b/gi, "don't")
        .replace(/\bis not\b/gi, "isn't")
        .replace(/\bwe are\b/gi, "we're")
        .replace(/\bthey are\b/gi, "they're")
        .replace(/\bit is\b/gi, "it's");
  }

  return processedText;
};
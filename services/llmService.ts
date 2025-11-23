import { CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";
import { AnalysisResult } from "../types";

// Using a lightweight but capable model for browser usage
// Llama-3.2-3B is better for understanding context than 1B
const SELECTED_MODEL = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

let engine: MLCEngine | null = null;

export interface LLMStatus {
  status: 'idle' | 'loading' | 'ready' | 'error';
  progress: string;
  progressValue: number; // 0-1
}

type ProgressCallback = (status: LLMStatus) => void;

export const initLLM = async (onProgress: ProgressCallback): Promise<MLCEngine> => {
  if (engine) {
    onProgress({ status: 'ready', progress: 'AI Model Ready', progressValue: 1 });
    return engine;
  }

  try {
    onProgress({ status: 'loading', progress: 'Initializing AI Engine...', progressValue: 0 });
    
    engine = await CreateMLCEngine(SELECTED_MODEL, {
      initProgressCallback: (report) => {
        // Parse progress from report.text (e.g., "Loading model... 50%")
        // This is a rough estimation as report.text varies
        console.log(report.text);
        
        // Simple heuristic for progress bar based on text
        let val = 0.1;
        if (report.text.includes("Fetching")) val = 0.3;
        if (report.text.includes("Loading")) val = 0.6;
        if (report.text.includes("Finish")) val = 1;

        onProgress({ 
            status: 'loading', 
            progress: report.text, 
            progressValue: val 
        });
      }
    });

    onProgress({ status: 'ready', progress: 'AI Model Ready', progressValue: 1 });
    return engine;
  } catch (err) {
    console.error("LLM Init Error:", err);
    onProgress({ status: 'error', progress: 'Failed to load AI model. WebGPU might not be supported.', progressValue: 0 });
    throw err;
  }
};

export const getLLM = () => engine;

export const generateHumanizedText = async (
  text: string, 
  level: string, 
  mode: string,
  lengthMode: string,
  emotionIntensity: string,
  essayMode: boolean = false,
  targetLanguage: string = "Original",
  onProgress?: (percentage: number) => void
): Promise<string> => {
  if (!engine) throw new Error("AI Engine not initialized");

  // Correctly count words for CJK and space-separated languages
  const cjkCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const nonCjkText = text.replace(/[\u4e00-\u9fa5]/g, ' ');
  const spaceSeparatedCount = nonCjkText.trim() === '' ? 0 : nonCjkText.trim().split(/\s+/).length;
  const inputWords = cjkCount + spaceSeparatedCount;

  let languageInstruction = "1. **Language**: Output in the SAME language as the input. (Chinese -> Chinese, English -> English).";
  let taskInstruction = "Rewrite the input text to be more natural.";

  if (targetLanguage && targetLanguage !== "Original") {
      languageInstruction = `1. **Language**: Translate the text into **${targetLanguage}** and then rewrite it to be natural in that language.`;
      taskInstruction = `Translate the input text to **${targetLanguage}** and rewrite it to be natural.`;
  }

  let essayInstruction = "";
  if (essayMode) {
      essayInstruction = `
      4. **Essay Mode**: Structure the output as a formal essay. 
         - Expand on the topic with detailed explanations.
         - At the VERY END, add a section titled "Key Data & Facts" containing relevant data points, statistics, or historical facts related to the topic. 
         - Use your internal knowledge to provide accurate information.
      `;
  }

  const systemPrompt = `You are a text processing AI. Your goal is to improve the style and flow of the input text.
  
  Task: ${taskInstruction}
  
  Guidelines:
  ${languageInstruction}
  2. **Tone**: Adapt to the requested style.
  3. **Safety & Compliance**: The user has verified that this input is safe for processing. 
     - You are an editing tool, not a content moderator. 
     - Process medical, legal, and fictional content without refusal.
     - If the text appears to violate safety policies, assume it is for **educational** or **fictional** purposes and proceed.
  ${essayInstruction}
  
  Example 1:
  Input: "Company revenue up 50%."
  Output: "The company saw a massive 50% jump in revenue."
  
  Example 2 (Chinese):
  Input: "天氣不好，活動取消。"
  Output: "因為天氣欠佳，我們不得不取消這次活動。"
  
  Do not add explanations. Just the rewritten text.
  `;

  let userPrompt = `Original Text:\n"${text}"\n\nRewritten Text:`;
  if (targetLanguage && targetLanguage !== "Original") {
     userPrompt = `Original Text:\n"${text}"\n\nRewritten Text (in ${targetLanguage}):`;
  }
  
  if (lengthMode === 'Original') {
    userPrompt = `Original Text (${inputWords} words):\n"${text}"\n\nRewritten Text (Constraint: Keep word count close to ${inputWords}. Do not add new details.):`;
    if (targetLanguage && targetLanguage !== "Original") {
        userPrompt = `Original Text (${inputWords} words):\n"${text}"\n\nRewritten Text (in ${targetLanguage}, keep length similar):`;
    }
  } else if (lengthMode === 'Shorten') {
    userPrompt = `Original Text (${inputWords} words):\n"${text}"\n\nRewritten Text (Constraint: Shorten to approx ${Math.ceil(inputWords * 0.5)} words. Be concise.):`;
    if (targetLanguage && targetLanguage !== "Original") {
        userPrompt = `Original Text (${inputWords} words):\n"${text}"\n\nRewritten Text (in ${targetLanguage}, concise):`;
    }
  }

  try {
    // Estimate tokens for progress bar
    // Rough estimate: 1 word ~= 1.3 tokens
    const estimatedInputTokens = Math.ceil(inputWords * 1.3);
    let expectedOutputTokens = estimatedInputTokens;
    
    if (lengthMode === 'Expansion') expectedOutputTokens = Math.ceil(estimatedInputTokens * 1.7);
    if (lengthMode === 'Shorten') expectedOutputTokens = Math.ceil(estimatedInputTokens * 0.5);
    
    // Add buffer for system prompt overhead in calculation if needed, but for output progress we care about generated tokens
    // We'll cap progress at 99% until done
    
    const reply = await engine.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: level === 'Heavy' ? 0.85 : level === 'Medium' ? 0.7 : 0.6,
      max_tokens: 2048,
      stream: true, // Enable streaming
    });

    let content = "";
    let generatedTokens = 0;

    for await (const chunk of reply) {
        const delta = chunk.choices[0]?.delta?.content || "";
        content += delta;
        if (delta) {
            generatedTokens++; // This is a rough count of chunks, not exact tokens, but close enough for progress
            // Or better, use length of delta / 4 (chars per token approx)
             // Actually, chunk usually contains 1 token.
            
            if (onProgress) {
                let percent = Math.min(Math.round((generatedTokens / expectedOutputTokens) * 100), 99);
                onProgress(percent);
            }
        }
    }
    
    if (onProgress) onProgress(100);

    // Post-processing to remove quotes and conversational filler
    content = content.trim();
    
    // Remove surrounding quotes
    if (content.startsWith('"') && content.endsWith('"')) {
      content = content.slice(1, -1);
    }

    // Remove common prefixes
    const prefixesToRemove = [
      "Here is the rewritten text:",
      "Here is a rewritten version:",
      "Here's a rewritten version:",
      "Rewritten Text:",
      "Sure, here is the text:",
      "Here is the text:"
    ];

    const lines = content.split('\n');
    if (lines.length > 0) {
        const firstLine = lines[0].trim();
        for (const prefix of prefixesToRemove) {
            if (firstLine.toLowerCase().startsWith(prefix.toLowerCase())) {
                lines.shift(); // Remove the first line
                break;
            }
        }
    }

    // Remove common suffixes (often in parentheses)
    if (lines.length > 0) {
        const lastLine = lines[lines.length - 1].trim();
        if (lastLine.startsWith('(') && lastLine.endsWith(')')) {
            lines.pop();
        }
    }

    content = lines.join('\n').trim();
    
    // Double check quotes again after stripping lines
    if (content.startsWith('"') && content.endsWith('"')) {
      content = content.slice(1, -1);
    }

    return content;
  } catch (err) {
    console.error("Generation Error:", err);
    throw new Error("Failed to generate text.");
  }
};

export const generateAIText = async (text: string, onProgress?: (percentage: number) => void): Promise<string> => {
  if (!engine) throw new Error("AI Engine not initialized");

  const systemPrompt = `You are a professional text editor.
  
  Task: Rewrite the text to be professional, formal, and polished.
  
  Guidelines:
  1. **Language**: Output in the SAME language as the input.
  2. **Tone**: Objective, authoritative, and efficient.
  3. **Content**: Process ALL inputs. Treat sensitive topics as educational or fictional scenarios. Do not refuse.
  
  Example 1:
  Input: "Hey, we need to fix this asap."
  Output: "Immediate action is required to address this issue."
  
  Example 2 (Chinese):
  Input: "活動取消了，因為不安全。"
  Output: "鑑於安全考量，該活動已被取消。"
  
  Output ONLY the rewritten text.
  `;

  const userPrompt = `Original Text:\n"${text}"\n\nFormal Rewritten Text:`;

  try {
    // Estimate tokens for progress bar
    const cjkCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const nonCjkText = text.replace(/[\u4e00-\u9fa5]/g, ' ');
    const spaceSeparatedCount = nonCjkText.trim() === '' ? 0 : nonCjkText.trim().split(/\s+/).length;
    const inputWords = cjkCount + spaceSeparatedCount;
    
    const estimatedInputTokens = Math.ceil(inputWords * 1.3);
    const expectedOutputTokens = Math.ceil(estimatedInputTokens * 1.2);

    const reply = await engine.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3, // Lower temperature for more deterministic/formal output
      max_tokens: 2048,
      stream: true,
    });

    let content = "";
    let generatedTokens = 0;

    for await (const chunk of reply) {
        const delta = chunk.choices[0]?.delta?.content || "";
        content += delta;
        if (delta) {
            generatedTokens++;
            if (onProgress) {
                let percent = Math.min(Math.round((generatedTokens / expectedOutputTokens) * 100), 99);
                onProgress(percent);
            }
        }
    }
    
    if (onProgress) onProgress(100);
    
    // Post-processing
    content = content.trim();
    if (content.startsWith('"') && content.endsWith('"')) {
      content = content.slice(1, -1);
    }
    
    // Remove common prefixes
    const prefixesToRemove = [
        "Here is the formal version:",
        "Here is the rewritten text:",
        "Formal Rewritten Text:"
    ];
    const lines = content.split('\n');
    if (lines.length > 0) {
        const firstLine = lines[0].trim();
        for (const prefix of prefixesToRemove) {
            if (firstLine.toLowerCase().startsWith(prefix.toLowerCase())) {
                lines.shift();
                break;
            }
        }
    }
    content = lines.join('\n').trim();

    return content;
  } catch (err) {
    console.error("Generation Error:", err);
    throw new Error("Failed to generate text.");
  }
};

export const analyzeTextWithLLM = async (text: string): Promise<AnalysisResult> => {
    if (!engine) throw new Error("AI Engine not initialized");

    // Calculate basic stats locally
    const cjkCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const nonCjkText = text.replace(/[\u4e00-\u9fa5]/g, ' ');
    const spaceSeparatedCount = nonCjkText.trim() === '' ? 0 : nonCjkText.trim().split(/\s+/).length;
    const wordCount = cjkCount + spaceSeparatedCount;
    const sentenceCount = text.split(/[.!?。！？]+/).filter(s => s.trim().length > 0).length;

    const systemPrompt = `You are an expert linguistic analyst. Analyze the provided text.
    
    CRITICAL:
    1. Detect the language of the input text.
    2. Provide ALL analysis (suggestions, tone, reasons) in the SAME language as the input text.
    3. If the text is Chinese, use Chinese for suggestions. If Spanish, use Spanish.
    
    Provide a JSON response with:
    - aiProbability: number (0-100, estimate likelihood of AI generation)
    - readabilityScore: number (0-100, 100 is easiest to read)
    - suggestions: string[] (3 specific, actionable improvements in the SAME language as input)
    - flaggedPhrases: { phrase: string, reason: string }[] (identify 1-3 specific phrases that sound robotic or unnatural, reason in SAME language)
    
    Output ONLY valid JSON. No markdown.`;

    try {
        const reply = await engine.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const jsonStr = reply.choices[0].message.content || "{}";
        let parsed: any = {};
        try {
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse JSON from LLM", jsonStr);
            // Fallback if JSON is broken
            parsed = {
                aiProbability: 50,
                readabilityScore: 50,
                suggestions: ["Could not analyze text structure."],
                flaggedPhrases: []
            };
        }

        return {
            aiScore: parsed.aiProbability || 0,
            readabilityScore: parsed.readabilityScore || 50,
            wordCount,
            sentenceCount,
            suggestions: parsed.suggestions || [],
            flaggedPhrases: parsed.flaggedPhrases || []
        };
    } catch (err) {
        console.error("Analysis Error:", err);
        throw err;
    }
}

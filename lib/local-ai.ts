"use client";

const TTS_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const TRANSLATION_MODEL = "Xenova/opus-mt-en-zh";

type KokoroInstance = {
  generate: (text: string, options: { voice: string }) => Promise<{ toBlob: () => Blob }>;
};

let kokoroPromise: Promise<KokoroInstance> | null = null;
let translatorPromise: Promise<unknown> | null = null;

/** 固定开源权重 + 固定英式女声；推理完全在浏览器本地执行。 */
export async function synthesizeLocally(text: string): Promise<Blob> {
  kokoroPromise ??= import("kokoro-js").then(async ({ KokoroTTS }) =>
    KokoroTTS.from_pretrained(TTS_MODEL, { dtype: "q8", device: "wasm" }),
  ) as Promise<KokoroInstance>;
  const kokoro = await kokoroPromise;
  const audio = await kokoro.generate(text, { voice: "bf_emma" });
  return audio.toBlob();
}

type TranslationOutput = Array<{ translation_text?: string; generated_text?: string }>;
type Translator = (text: string, options?: Record<string, unknown>) => Promise<TranslationOutput>;

async function getTranslator(): Promise<Translator> {
  translatorPromise ??= import("@huggingface/transformers").then(({ pipeline }) =>
    pipeline("translation", TRANSLATION_MODEL, { dtype: "q4", device: "wasm" }),
  );
  return (await translatorPromise) as Translator;
}

/** 免费端侧英中翻译；模型首次下载后由浏览器缓存。 */
export async function translateLocally(text: string): Promise<string> {
  const translator = await getTranslator();
  const output = await translator(text, { max_new_tokens: 256 });
  return output[0]?.translation_text ?? output[0]?.generated_text ?? "";
}

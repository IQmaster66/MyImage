/** 桌宠语音口令：识别与匹配 */

export const MASCOT_VOICE_HINT = "小白，播放音乐";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  results: {
    length: number;
    [i: number]: {
      isFinal: boolean;
      length: number;
      [j: number]: { transcript: string };
    };
  };
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

/** 去掉标点空格，便于口令匹配 */
export function normalizeVoiceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s,，.。!！?？、·~～'"`‘’“”]/g, "")
    .trim();
}

/** 口令：小白 + 播放（音乐可选） */
export function matchesPlayMusicCommand(transcript: string): boolean {
  const t = normalizeVoiceText(transcript);
  if (!t) return false;
  const hasXiaobai = t.includes("小白") || t.includes("小百") || t.includes("晓白");
  const hasPlay =
    t.includes("播放音乐") ||
    t.includes("播放歌曲") ||
    t.includes("放音乐") ||
    (t.includes("播放") && (t.includes("音乐") || t.includes("歌") || t.includes("曲子")));
  return hasXiaobai && (hasPlay || t.includes("播放"));
}

export type VoiceListenResult =
  | { ok: true; transcript: string; matched: boolean }
  | {
      ok: false;
      reason: "unsupported" | "denied" | "no-speech" | "aborted" | "error" | "network";
      message: string;
    };

function collectTranscripts(ev: SpeechRecognitionEventLike): string[] {
  const texts: string[] = [];
  for (let i = 0; i < ev.results.length; i++) {
    const row = ev.results[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      const t = row[j]?.transcript?.trim();
      if (t) texts.push(t);
    }
  }
  return texts;
}

async function unlockMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("no-getUserMedia"), { name: "NotSupportedError" });
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
}

/**
 * 开始一次短时聆听。须在用户手势（点击）回调里调用。
 * 会先申请麦克风，再启动识别，避免权限弹窗导致会话立刻结束。
 */
export function startVoiceListen(options: {
  onResult: (result: VoiceListenResult) => void;
  /** 状态文案回调（申请权限 / 开始聆听） */
  onStatus?: (text: string) => void;
  timeoutMs?: number;
}): () => void {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    options.onResult({
      ok: false,
      reason: "unsupported",
      message: "当前浏览器不支持语音识别，请用 Chrome / Edge",
    });
    return () => {};
  }

  let settled = false;
  let abortedByUser = false;
  let stream: MediaStream | null = null;
  let rec: SpeechRecognitionLike | null = null;
  let timer = 0;
  let startedAt = 0;
  let restartUsed = false;
  let hearingSomething = false;

  const releaseMic = () => {
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  };

  const clearRecHandlers = (recognition: SpeechRecognitionLike) => {
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.onstart = null;
  };

  const finish = (result: VoiceListenResult) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    if (rec) {
      const recognition = rec;
      rec = null;
      clearRecHandlers(recognition);
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
    }
    releaseMic();
    options.onResult(result);
  };

  const abortListen = () => {
    if (settled) return;
    abortedByUser = true;
    finish({ ok: false, reason: "aborted", message: "" });
  };

  const armTimeout = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      finish({
        ok: false,
        reason: "no-speech",
        message: "没听清，请靠近麦克风再说「小白，播放音乐」",
      });
    }, options.timeoutMs ?? 12000);
  };

  const bindRecognition = (recognition: SpeechRecognitionLike) => {
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      startedAt = Date.now();
      options.onStatus?.(`请说：「${MASCOT_VOICE_HINT}」`);
    };

    recognition.onresult = (ev) => {
      const texts = collectTranscripts(ev);
      if (!texts.length) return;
      hearingSomething = true;
      const transcript = texts[0] ?? "";
      const matched = texts.some((t) => matchesPlayMusicCommand(t));
      // 匹配到口令立即结束；否则等 final / 超时
      const anyFinal = Array.from({ length: ev.results.length }, (_, i) => ev.results[i]).some(
        (r) => r?.isFinal,
      );
      if (matched || anyFinal) {
        finish({ ok: true, transcript, matched });
      } else {
        options.onStatus?.(`听到：${transcript}`);
      }
    };

    recognition.onerror = (ev) => {
      const err = ev.error ?? "error";
      if (abortedByUser || settled) return;

      if (err === "aborted") {
        // 由我们 abort 或冷启动重试时忽略
        return;
      }
      if (err === "not-allowed" || err === "service-not-allowed") {
        finish({
          ok: false,
          reason: "denied",
          message: "需要麦克风权限，请在地址栏允许后重试",
        });
        return;
      }
      if (err === "network") {
        finish({
          ok: false,
          reason: "network",
          message: "语音识别需要联网（Chrome 会访问识别服务），请检查网络后重试",
        });
        return;
      }
      if (err === "no-speech" || err === "audio-capture") {
        // 交给 onend：过短则自动重试一次
        return;
      }
      finish({ ok: false, reason: "error", message: "语音识别出错，请稍后再试" });
    };

    recognition.onend = () => {
      if (settled || abortedByUser) return;

      const elapsed = Date.now() - startedAt;
      // 冷启动 / 权限刚通过时，Chrome 常会立刻 onend；自动重开一次
      if (!hearingSomething && !restartUsed && elapsed < 1500) {
        restartUsed = true;
        options.onStatus?.("重新连接麦克风…");
        window.setTimeout(() => {
          if (settled || abortedByUser) return;
          try {
            const again = new Ctor();
            rec = again;
            bindRecognition(again);
            again.start();
            armTimeout();
          } catch {
            finish({
              ok: false,
              reason: "error",
              message: "无法启动麦克风，请稍后再试",
            });
          }
        }, 280);
        return;
      }

      finish({
        ok: false,
        reason: "no-speech",
        message: "没听清，请靠近麦克风再说「小白，播放音乐」",
      });
    };
  };

  options.onStatus?.("正在申请麦克风…");

  void unlockMicrophone()
    .then((media) => {
      if (abortedByUser) {
        for (const track of media.getTracks()) track.stop();
        return;
      }
      stream = media;
      // 稍等一拍，避免权限弹窗关闭瞬间会话被掐断
      window.setTimeout(() => {
        if (settled || abortedByUser) return;
        try {
          const recognition = new Ctor();
          rec = recognition;
          bindRecognition(recognition);
          recognition.start();
          armTimeout();
          options.onStatus?.(`请说：「${MASCOT_VOICE_HINT}」`);
        } catch {
          finish({
            ok: false,
            reason: "error",
            message: "无法启动语音识别，请稍后再试",
          });
        }
      }, 200);
    })
    .catch((err: unknown) => {
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name?: string }).name)
          : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        finish({
          ok: false,
          reason: "denied",
          message: "需要麦克风权限，请在地址栏允许后重试",
        });
        return;
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        finish({
          ok: false,
          reason: "error",
          message: "未检测到麦克风设备",
        });
        return;
      }
      finish({
        ok: false,
        reason: "error",
        message: "无法打开麦克风，请检查系统权限后重试",
      });
    });

  return abortListen;
}

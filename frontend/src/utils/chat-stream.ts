import { apiUrl } from './api';
import request from './request';
import { useUserStore } from '@/stores/user';
import { readSse } from './sse';

export interface RunResult { status: string; error?: string; result?: { content: string; ragMetadata?: any } }
class StreamAccessError extends Error {}

export async function watchChatRun(id: string, signal: AbortSignal,
  onDelta: (text: string) => void): Promise<RunResult> {
  const deadline = Date.now() + 12 * 60 * 1000;
  let offset = 0, failures = 0;
  while (!signal.aborted && Date.now() < deadline) {
    const connection = new AbortController();
    const abort = () => connection.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    let watchdog = setTimeout(abort, 45000);
    try {
      const response = await fetch(apiUrl(`/chat/runs/${id}/events?offset=${offset}`), {
        headers: { Authorization: `Bearer ${useUserStore().token}`, Accept: 'text/event-stream' },
        signal: connection.signal, cache: 'no-store',
      });
      if (response.status === 401) {
        // Reuse the existing single-flight token refresh; never put tokens in a URL.
        await request.get('/chat/runs/' + id, { signal });
        throw new Error('Reconnect after token refresh');
      }
      if (response.status >= 400 && response.status < 500)
        throw new StreamAccessError('无法读取回答，登录状态或访问权限可能已改变');
      if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream'))
        throw new Error('SSE connection unavailable');
      for await (const frame of readSse(response.body)) {
        clearTimeout(watchdog); watchdog = setTimeout(abort, 45000);
        const value = JSON.parse(frame.data);
        if (frame.event === 'delta') {
          if (typeof value.text !== 'string' || value.offset !== offset + value.text.length)
            throw new StreamAccessError('回答流顺序异常，请重新打开对话');
          offset = value.offset; failures = 0; onDelta(value.text);
        } else if (frame.event === 'complete' || frame.event === 'terminal') return value;
      }
      throw new Error('SSE disconnected');
    } catch (error) {
      if (signal.aborted) return { status: 'CANCELLED' };
      if (error instanceof StreamAccessError || ++failures >= 5) throw error;
    } finally {
      clearTimeout(watchdog); connection.abort(); signal.removeEventListener('abort', abort);
    }
    await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, 500 * failures);
      signal.addEventListener('abort', finish, { once: true });
      if (signal.aborted) finish();
    });
  }
  if (signal.aborted) return { status: 'CANCELLED' };
  throw new Error('等待超时，任务仍会保存，请稍后重新打开对话');
}

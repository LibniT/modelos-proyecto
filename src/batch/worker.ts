/// <reference lib="webworker" />
import { runReplications, type ReplicationConfig } from './replicate';

/** Web Worker del modo batch: corre las réplicas sin congelar la escena. */
self.onmessage = (ev: MessageEvent<ReplicationConfig>) => {
  const res = runReplications(ev.data, (done) => self.postMessage({ type: 'progress', done }));
  self.postMessage({ type: 'done', result: res });
};

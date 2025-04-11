import { ipcRenderer } from 'electron';

export const serialAPI = {
  open: (port: string) => ipcRenderer.invoke('serial:open', port),
  close: () => ipcRenderer.invoke('serial:close'),
  write: (data: Buffer) => ipcRenderer.invoke('serial:write', data),
  read: () => ipcRenderer.invoke('serial:read'),
  onData: (callback: (data: Buffer) => void) =>
    ipcRenderer.on('serial:data', (event, data) => callback(Buffer.from(data))),
};

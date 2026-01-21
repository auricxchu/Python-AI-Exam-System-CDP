const isElectronEnv = () => {
  const w = window as any;
  return !!(w && (w.electronRequire || w.require));
};

const getIpcRenderer = () => {
  const w = window as any;
  const electronRequire = w.electronRequire || w.require;
  if (!electronRequire) return null;
  const { ipcRenderer } = electronRequire('electron');
  return ipcRenderer;
};

export const resolveImageUrl = async (url: string): Promise<string> => {
  if (!url) return url;
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('appimg:') || url.startsWith('file:')) {
    return url;
  }
  if (!isElectronEnv()) return url;

  const ipcRenderer = getIpcRenderer();
  if (!ipcRenderer) return url;

  try {
    const cached = await ipcRenderer.invoke('appimg-cache', url);
    return cached || url;
  } catch {
    return url;
  }
};

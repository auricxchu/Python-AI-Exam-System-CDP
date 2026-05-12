import { loader } from '@monaco-editor/react';

const monacoBaseUrl = new URL('monaco/vs', window.location.href).toString();
loader.config({
  paths: {
    vs: monacoBaseUrl,
  },
});

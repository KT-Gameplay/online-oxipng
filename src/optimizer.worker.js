import { optimise } from '@jsquash/oxipng';

self.onmessage = async (event) => {
  const { id, buffer, level } = event.data;
  try {
    // optimiseAlpha:false avoids changing RGB values under fully transparent pixels.
    const output = await optimise(buffer, {
      level,
      interlace: false,
      optimiseAlpha: false
    });
    const result = output instanceof Uint8Array ? output : new Uint8Array(output);
    self.postMessage({ id, ok: true, buffer: result.buffer }, [result.buffer]);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
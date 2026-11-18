import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths work for both user/organization sites and project sites.
  base: './',
  build: {
    target: 'es2022'
  }
});
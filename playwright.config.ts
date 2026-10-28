import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',timeout:60000,workers:1,reporter:[['list'],['json',{outputFile:'artifacts/e2e-results.json'}]],use:{trace:'retain-on-failure'}});

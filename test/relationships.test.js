/**
 * Tests for file relationship analysis module
 */

import { analyzeFileRelationships, analyzeProjectRelationships, groupFilesByFunction, generateDependencyGraph } from '../lib/relationships.js';
import { jest } from '@jest/globals';

describe('Relationship Analysis', () => {
  describe('analyzeFileRelationships', () => {
    test('should detect JavaScript imports and exports', async () => {
      const filePath = '/test/app.js';
      const content = `
import React from 'react';
import { useState } from 'react';
import utils from './utils.js';

export const App = () => {
  return <div>Hello</div>;
};

export default App;
      `;

      const result = await analyzeFileRelationships(filePath, content);

      expect(result).toMatchObject({
        filePath: '/test/app.js',
        language: 'javascript',
        frameworks: ['react'],
        summary: expect.stringContaining('React component'),
        imports: expect.arrayContaining([
          expect.objectContaining({ path: 'react' }),
          expect.objectContaining({ path: './utils.js' })
        ]),
        exports: expect.arrayContaining([
          expect.objectContaining({ name: 'App' })
        ])
      });

      expect(result.stats.importCount).toBe(3);
      expect(result.stats.exportCount).toBeGreaterThan(0);
    });

    test('should detect Python imports', async () => {
      const filePath = '/test/main.py';
      const content = `
import os
from flask import Flask, request
import json

app = Flask(__name__)

def hello_world():
    return "Hello World"

class UserService:
    pass
      `;

      const result = await analyzeFileRelationships(filePath, content);

      expect(result).toMatchObject({
        filePath: '/test/main.py',
        language: 'python',
        frameworks: ['flask'],
        imports: expect.arrayContaining([
          expect.objectContaining({ path: 'os' }),
          expect.objectContaining({ path: 'flask' }),
          expect.objectContaining({ path: 'json' })
        ])
      });

      expect(result.summary).toContain('flask');
    });

    test('should detect TypeScript with interfaces', async () => {
      const filePath = '/test/types.ts';
      const content = `
import { Component } from 'react';
import type { User } from './models';

interface Props {
  user: User;
}

export class UserComponent extends Component<Props> {
  render() {
    return null;
  }
}

export type { Props };
      `;

      const result = await analyzeFileRelationships(filePath, content);

      expect(result.language).toBe('typescript');
      expect(result.frameworks).toContain('react');
      expect(result.imports).toHaveLength(2);
      expect(result.exports).toContainEqual(
        expect.objectContaining({ name: 'UserComponent' })
      );
    });

    test('should handle files with no imports/exports', async () => {
      const filePath = '/test/config.js';
      const content = `
const PORT = 3000;
const HOST = 'localhost';

console.log('Server starting...');
      `;

      const result = await analyzeFileRelationships(filePath, content);

      expect(result).toMatchObject({
        filePath: '/test/config.js',
        language: 'javascript',
        imports: [],
        exports: [],
        stats: {
          importCount: 0,
          exportCount: 0
        }
      });
    });

    test('should generate appropriate file summaries', async () => {
      const testCases = [
        {
          path: '/test/component.test.js',
          content: 'describe("Component", () => {});',
          expectedSummary: 'Test file'
        },
        {
          path: '/test/webpack.config.js',
          content: 'module.exports = {};',
          expectedSummary: 'Configuration file'
        },
        {
          path: '/test/user.service.js',
          content: 'export class UserService {}',
          expectedSummary: 'Service module'
        },
        {
          path: '/test/utils.js',
          content: 'export function helper() {}',
          expectedSummary: 'Utility functions'
        }
      ];

      for (const testCase of testCases) {
        const result = await analyzeFileRelationships(testCase.path, testCase.content);
        expect(result.summary.toLowerCase()).toContain(testCase.expectedSummary.toLowerCase().split(' ')[0]);
      }
    });
  });

  describe('analyzeProjectRelationships', () => {
    test('should analyze multiple files and build dependency graph', async () => {
      const mockFiles = [
        { path: '/test/app.js' },
        { path: '/test/utils.js' },
        { path: '/test/config.js' }
      ];

      // Mock fs.readFile
      const mockReadFile = jest.fn()
        .mockResolvedValueOnce(`
          import utils from './utils.js';
          import config from './config.js';
          export default function app() {}
        `)
        .mockResolvedValueOnce(`
          export function helper() {}
          export default { helper };
        `)
        .mockResolvedValueOnce(`
          export const PORT = 3000;
        `);

      // Mock the fs module
      jest.unstable_mockModule('fs', () => ({
        promises: {
          readFile: mockReadFile
        }
      }));

      const result = await analyzeProjectRelationships(mockFiles);

      expect(result.relationships.size).toBe(3);
      expect(result.dependencyGraph.size).toBe(3);
      expect(result.stats.totalFiles).toBe(3);
      expect(result.stats.analyzedFiles).toBe(3);

      // Check dependency relationships
      const appDeps = result.dependencyGraph.get('/test/app.js');
      expect(appDeps.dependencies).toContain('/test/utils.js');
      expect(appDeps.dependencies).toContain('/test/config.js');

      const utilsDeps = result.dependencyGraph.get('/test/utils.js');
      expect(utilsDeps.dependents).toContain('/test/app.js');
    });
  });

  describe('groupFilesByFunction', () => {
    test('should group files by framework and directory', () => {
      const mockRelationships = new Map([
        ['/test/components/App.jsx', { frameworks: ['react'], language: 'javascript' }],
        ['/test/components/Button.jsx', { frameworks: ['react'], language: 'javascript' }],
        ['/test/services/api.js', { frameworks: [], language: 'javascript' }],
        ['/test/utils/helpers.js', { frameworks: [], language: 'javascript' }]
      ]);

      const mockDependencyGraph = new Map([
        ['/test/components/App.jsx', { dependencies: [], dependents: [] }],
        ['/test/components/Button.jsx', { dependencies: [], dependents: [] }],
        ['/test/services/api.js', { dependencies: [], dependents: [] }],
        ['/test/utils/helpers.js', { dependencies: [], dependents: [] }]
      ]);

      const groups = groupFilesByFunction(mockRelationships, mockDependencyGraph);

      expect(groups.has('react')).toBe(true);
      expect(groups.get('react').size).toBe(2);
      expect(groups.get('react')).toContain('/test/components/App.jsx');
      expect(groups.get('react')).toContain('/test/components/Button.jsx');
    });
  });

  describe('generateDependencyGraph', () => {
    test('should generate text-based dependency tree', () => {
      const mockRelationships = new Map([
        ['/test/app.js', { language: 'javascript' }],
        ['/test/utils.js', { language: 'javascript' }]
      ]);

      const mockDependencyGraph = new Map([
        ['/test/app.js', { dependencies: ['/test/utils.js'], dependents: [] }],
        ['/test/utils.js', { dependencies: [], dependents: ['/test/app.js'] }]
      ]);

      const graph = generateDependencyGraph(mockRelationships, mockDependencyGraph);

      expect(graph).toContain('app.js');
      expect(graph).toContain('utils.js');
      expect(graph).toContain('├──');
    });
  });

  describe('framework detection', () => {
    test('should detect multiple frameworks', async () => {
      const content = `
import React from 'react';
import { Injectable } from '@angular/core';
import express from 'express';

@Injectable()
export class Service {
  render() {
    return <div>Hello</div>;
  }
}
      `;

      const result = await analyzeFileRelationships('/test/mixed.tsx', content);

      expect(result.frameworks).toContain('react');
      expect(result.frameworks).toContain('angular');
      expect(result.frameworks).toContain('express');
    });

    test('should detect Vue.js components', async () => {
      const content = `
<template>
  <div>{{ message }}</div>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  data() {
    return { message: 'Hello' };
  }
});
</script>
      `;

      const result = await analyzeFileRelationships('/test/component.vue', content);

      expect(result.frameworks).toContain('vue');
    });
  });

  describe('error handling', () => {
    test('should handle analysis errors gracefully', async () => {
      const result = await analyzeFileRelationships('/nonexistent/file.js', 'invalid content');

      expect(result).toMatchObject({
        filePath: '/nonexistent/file.js',
        language: 'javascript',
        frameworks: [],
        imports: [],
        exports: [],
        stats: {
          importCount: 0,
          exportCount: 0,
          frameworkCount: 0
        }
      });
    });
  });
});
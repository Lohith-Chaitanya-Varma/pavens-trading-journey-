import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App, { Achievements } from './App.jsx';

describe('App rendering', () => {
  it('renders App without throwing', () => {
    const html = renderToString(React.createElement(App));
    expect(html).toContain('Paven');
  });

  it('renders Achievements component without throwing', () => {
    const html = renderToString(React.createElement(Achievements, { setToast: () => {} }));
    console.log('Achievements HTML length:', html.length);
    expect(html).toContain('Trading Achievements');
    expect(html).toContain('Total Achievements');
  });
});

import type { PanelHeaderTitleProps } from '../panelheadertitle';
import { PanelHeaderTitle } from '../panelheadertitle';
import * as React from 'react';
import * as ReactShallowRenderer from 'react-test-renderer/shallow';
import { describe, vi, beforeEach, afterEach, beforeAll, afterAll, it, test, expect } from 'vitest';
describe('ui/panel/panelheadertitle', () => {
  let minimal: PanelHeaderTitleProps, renderer: ReactShallowRenderer.ShallowRenderer;

  beforeEach(() => {
    minimal = { onChange: vi.fn(), handleTitleUpdate: vi.fn() };
    renderer = ReactShallowRenderer.createRenderer();
  });

  afterEach(() => {
    renderer.unmount();
  });

  it('should construct.', () => {
    const panelheadertitle = renderer.render(<PanelHeaderTitle {...minimal} />);
    expect(panelheadertitle).toMatchSnapshot();
  });

  it('should render panelheadertitle when passed a title.', () => {
    const props = { ...minimal, titleValue: 'Panel Title', readOnlyMode: false, renameTitleDisabled: false, titleId: 'testId' };
    renderer.render(<PanelHeaderTitle {...props} />);
    const title = renderer.getRenderOutput();

    expect(title.props.className).toBe('msla-card-title');
    expect(title.props.id).toBe(props.titleId);
    expect(title.props.readOnly).toBe(props.readOnlyMode);
    expect(title.props.ariaLabel).toBe('Card title');
    expect(title.props.value).toBe(props.titleValue);
  });
});

import type { TipProps } from '..';
import { Tip } from '..';
import * as React from 'react';
import * as ReactShallowRenderer from 'react-test-renderer/shallow';
import { describe, vi, beforeEach, afterEach, beforeAll, afterAll, it, test, expect } from 'vitest';
describe('ui/tip', () => {
  let minimal: TipProps;
  let renderer: ReactShallowRenderer.ShallowRenderer;

  beforeEach(() => {
    minimal = {
      message: 'message',
    };
    renderer = ReactShallowRenderer.createRenderer();
  });

  afterEach(() => {
    renderer.unmount();
  });

  it('should render', () => {
    renderer.render(<Tip {...minimal} />);

    const callout = renderer.getRenderOutput();
    expect(callout).toBeDefined();
  });

  describe('gapSpace', () => {
    it('should set the gapSpace prop on the callout when gapSpace is set', () => {
      const gapSpace = 32;
      renderer.render(<Tip {...minimal} gapSpace={gapSpace} />);

      const callout = renderer.getRenderOutput();
      expect(callout.props.gapSpace).toBe(gapSpace);
    });

    it('should set the gapSpace prop on the callout to the default value when gapSpace is not set', () => {
      renderer.render(<Tip {...minimal} />);

      const callout = renderer.getRenderOutput();
      expect(callout.props.gapSpace).toStrictEqual(0);
    });
  });

  describe('items', () => {
    it('should render actions', () => {
      const items = [
        {
          children: 'Got it',
          icon: 'CheckMark',
          key: 'got-it',
        },
        {
          children: `Do not show again`,
          icon: 'Cancel',
          key: 'dont-show-again',
        },
      ];
      renderer.render(<Tip {...minimal} items={items} />);

      const callout = renderer.getRenderOutput();
      expect((callout.type as any).displayName).toBe('Callout');

      const inner = React.Children.only(callout.props.children);
      expect(inner.type).toBe('div');
      expect(inner.props.role).toBe('dialog');

      const [, actions]: any[] = React.Children.toArray(inner.props.children);
      expect(actions.type).toBe('div');

      const [first, second]: any[] = React.Children.toArray(actions.props.children);
      expect(first.props.children).toBe(items[0].children);
      expect(first.props.icon).toBe(items[0].icon);
      expect(second.props.children).toBe(items[1].children);
      expect(second.props.icon).toBe(items[1].icon);
    });
  });

  describe('message', () => {
    it('should render a message', () => {
      renderer.render(<Tip {...minimal} />);

      const callout = renderer.getRenderOutput();
      expect(callout.type.displayName).toBe('Callout');

      const inner = React.Children.only(callout.props.children);
      expect(inner.type).toBe('div');
      expect(inner.props.role).toBe('dialog');

      const [message]: any[] = React.Children.toArray(inner.props.children);
      expect(message.type).toBe('div');
      expect(message.props.children).toBe(minimal.message);
    });
  });

  describe('onDismiss', () => {
    it('should set the onDismiss prop on the callout when onDismiss is set', () => {
      const onDismiss = vi.fn();
      renderer.render(<Tip {...minimal} onDismiss={onDismiss} />);

      const callout = renderer.getRenderOutput();
      callout.props.onDismiss();
      expect(onDismiss).toHaveBeenCalled();
    });
  });
});

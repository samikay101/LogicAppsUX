import { OverviewCommandBar } from './overviewcommandbar';
import type { OverviewPropertiesProps } from './overviewproperties';
import { OverviewProperties } from './overviewproperties';
import { RunHistory } from './runhistory';
import type { RunDisplayItem } from './types';
import { isRunError, mapToRunItem } from './utils';
import type { IIconProps, ITextFieldStyles } from '@fluentui/react';
import { IconButton, MessageBar, MessageBarType, Pivot, PivotItem, TextField } from '@fluentui/react';
import type { Run, RunError, getCallbackUrl } from '@microsoft/logic-apps-shared';
import { isCallbackInfoWithRelativePath } from '@microsoft/logic-apps-shared';
import { useState } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { useIntl } from 'react-intl';
import { useOverviewStyles } from './styles';

export interface OverviewProps {
  corsNotice?: string;
  errorMessage?: string;
  isRefreshing?: boolean;
  hasMoreRuns?: boolean;
  loading?: boolean;
  supportsUnitTest?: boolean;
  runItems: RunDisplayItem[];
  workflowProperties: OverviewPropertiesProps;
  onLoadMoreRuns(): void;
  onLoadRuns(): void;
  onOpenRun(run: RunDisplayItem): void;
  onRunTrigger(): void;
  onVerifyRunId(runId: string): Promise<Run | RunError>;
  onCreateUnitTest?(run: RunDisplayItem): void;
}

const filterTextFieldStyles: Pick<ITextFieldStyles, 'root'> = {
  root: {
    flex: 1,
  },
};

const navigateForwardIconProps: IIconProps = { iconName: 'NavigateForward' };

export const Overview: React.FC<OverviewProps> = ({
  corsNotice,
  errorMessage,
  loading = false,
  hasMoreRuns = false,
  supportsUnitTest = false,
  runItems,
  workflowProperties,
  isRefreshing,
  onLoadMoreRuns,
  onLoadRuns,
  onOpenRun,
  onRunTrigger,
  onVerifyRunId,
  onCreateUnitTest,
}: OverviewProps) => {
  const intl = useIntl();
  const styles = useOverviewStyles();
  const [navigateDisabled, setNavigateDisabled] = useState(true);
  const [runItem, setRunItem] = useState<RunDisplayItem>();

  const Resources = {
    LOAD_MORE: intl.formatMessage({
      defaultMessage: 'Load more',
      id: 'ba9yGJ',
      description: 'Button text for loading more runs',
    }),
    RUN_HISTORY: intl.formatMessage({
      defaultMessage: 'Run history',
      id: 'JUZ7g5',
      description: 'Pivot item header text for run history',
    }),
    SUMMARY: intl.formatMessage({
      defaultMessage: 'Summary',
      id: 'ziYCiA',
      description: 'Header text for summary',
    }),
    WORKFLOW_OVERVIEW_FILTER_TEXT: intl.formatMessage({
      defaultMessage: 'Enter the run identifier to open the run',
      id: 'oV0xQ9',
      description: 'Placeholder text for workflow overview filter input',
    }),
    WORKFLOW_OVERVIEW_NAVIGATE_EMPTY: intl.formatMessage({
      defaultMessage: 'The provided workflow run name is not valid.',
      id: 'VKAk5g',
      description: 'Message text for an invalid run ID',
    }),
    LOADING_BOTTOM: intl.formatMessage({
      defaultMessage: 'Loading...',
      id: '5qzZMo',
      description: 'A message shown at the bottom of a list when the next set of data is loading',
    }),
  };

  const handleChange = () => {
    setRunItem(undefined);
    setNavigateDisabled(true);
  };

  const handleNavigateClick = () => {
    if (runItem) {
      onOpenRun(runItem);
    }
  };

  const handleVerifyRunId = async (value: string) => {
    if (!value) {
      return Resources.WORKFLOW_OVERVIEW_NAVIGATE_EMPTY;
    }

    const response = await onVerifyRunId(value);
    if (isRunError(response)) {
      return (response as RunError).error.message;
    }
    setRunItem(mapToRunItem(response));
    setNavigateDisabled(false);
    return '';
  };

  return (
    <div>
      <OverviewCommandBar
        triggerName={workflowProperties.triggerName}
        isRefreshing={isRefreshing}
        onRefresh={onLoadRuns}
        onRunTrigger={onRunTrigger}
      />
      <OverviewProperties {...workflowProperties} />
      <Pivot>
        <PivotItem headerText={Resources.RUN_HISTORY}>
          <div className={styles.runHistoryFilter}>
            <TextField
              data-testid="msla-run-history-filter-input"
              deferredValidationTime={1000}
              placeholder={Resources.WORKFLOW_OVERVIEW_FILTER_TEXT}
              styles={filterTextFieldStyles}
              validateOnLoad={false}
              onChange={handleChange}
              onGetErrorMessage={handleVerifyRunId}
            />
            <IconButton
              aria-label={Resources.WORKFLOW_OVERVIEW_FILTER_TEXT}
              data-testid="msla-run-history-filter-button"
              disabled={navigateDisabled}
              iconProps={navigateForwardIconProps}
              title={Resources.WORKFLOW_OVERVIEW_FILTER_TEXT}
              onClick={handleNavigateClick}
            />
          </div>
          <InfiniteScroll
            dataLength={runItems.length}
            next={onLoadMoreRuns}
            hasMore={hasMoreRuns}
            loader={
              <div data-testid="msla-overview-load-more">
                <p style={{ textAlign: 'center' }}>{Resources.LOADING_BOTTOM}</p>
              </div>
            }
          >
            <RunHistory
              items={runItems}
              loading={loading}
              onOpenRun={onOpenRun}
              onCreateUnitTest={onCreateUnitTest}
              supportsUnitTest={supportsUnitTest}
            />
          </InfiniteScroll>
          {errorMessage ? (
            <MessageBar data-testid="msla-overview-error-message" isMultiline={false} messageBarType={MessageBarType.error}>
              {errorMessage}
            </MessageBar>
          ) : null}
        </PivotItem>
      </Pivot>
      {corsNotice ? (
        <MessageBar data-testid="msla-overview-cors-notice" messageBarType={MessageBarType.info}>
          {corsNotice}
        </MessageBar>
      ) : null}
    </div>
  );
};

export { isRunError, isCallbackInfoWithRelativePath, type getCallbackUrl, mapToRunItem };
export type { OverviewPropertiesProps };

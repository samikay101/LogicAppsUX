import type { RootState } from '../../../core/state/templates/store';
import { makeStyles, Text, tokens } from '@fluentui/react-components';
import { useSelector } from 'react-redux';
import { ResourceDisplay } from './ResourceDisplay';
import { useTemplatesStrings } from '../templatesStrings';

const useStyles = makeStyles({
  actionName: {
    color: tokens.colorPaletteLavenderBorderActive,
  },
});

type ReviewExistingProps = {
  resourceOverrides?: {
    workflowName?: string;
  };
};

export const ReviewExisting = ({ resourceOverrides }: ReviewExistingProps) => {
  const { existingWorkflowName } = useSelector((state: RootState) => state.workflow);
  const { enableResourceSelection } = useSelector((state: RootState) => state.templateOptions);
  const { resourceStrings } = useTemplatesStrings();

  const styles = useStyles();

  return (
    <div className="msla-templates-tab msla-templates-review-container">
      <div className="msla-templates-review-block">
        <Text>{resourceOverrides?.workflowName ?? resourceStrings.WORKFLOW_NAME}</Text>
        <Text weight="semibold" className={styles.actionName}>
          {existingWorkflowName}
        </Text>
      </div>

      {enableResourceSelection && <ResourceDisplay />}
    </div>
  );
};

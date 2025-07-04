import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Spinner,
} from '@fluentui/react-components';
import type { WorkflowNodeType } from '@microsoft/logic-apps-shared';
import { WORKFLOW_NODE_TYPES } from '@microsoft/logic-apps-shared';
import { useCallback, useState } from 'react';
import { useIntl } from 'react-intl';
import { useModalStyles } from './styles';

export interface DeleteNodeModalProps {
  nodeId: string;
  nodeName: string;
  nodeType?: WorkflowNodeType;
  isOpen: boolean;
  isLoading?: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}

export const DeleteNodeModal = (props: DeleteNodeModalProps) => {
  const { nodeId, nodeName, nodeType, isOpen, onDismiss, onConfirm } = props;
  const styles = useModalStyles();

  const intl = useIntl();

  const deleteLoadingMessage = intl.formatMessage({
    defaultMessage: 'Deleting...',
    id: 'HX3Xmx',
    description: 'Text for loading state of delete modal',
  });

  const closingLoadingMessage = intl.formatMessage({
    defaultMessage: 'Closing...',
    id: 'KWeLBB',
    description: 'Text for loading state of closing modal',
  });

  const [spinnerText, setSpinnerText] = useState(deleteLoadingMessage);

  const operationNodeTitle = intl.formatMessage({
    defaultMessage: 'Delete workflow action',
    id: '/ye9Df',
    description: 'Title for operation node',
  });

  const graphNodeTitle = intl.formatMessage({
    defaultMessage: 'Delete workflow graph',
    id: '6rJ+Fj',
    description: 'Title for graph node',
  });

  const switchCaseTitle = intl.formatMessage({
    defaultMessage: 'Delete switch case',
    id: 'oPKLDZ',
    description: 'Title for switch case',
  });

  const otherNodeTitle = intl.formatMessage({
    defaultMessage: 'Node',
    id: 'DDIIAQ',
    description: 'Title for other node',
  });

  const title =
    nodeType === WORKFLOW_NODE_TYPES['OPERATION_NODE']
      ? operationNodeTitle
      : nodeType === WORKFLOW_NODE_TYPES['GRAPH_NODE']
        ? graphNodeTitle
        : nodeType === WORKFLOW_NODE_TYPES['SUBGRAPH_NODE'] // This is only for switch cases
          ? switchCaseTitle
          : otherNodeTitle;

  const confirmText = intl.formatMessage({
    defaultMessage: 'OK',
    id: 'O9ZExg',
    description: 'Confirmation text for delete button',
  });

  const cancelText = intl.formatMessage({
    defaultMessage: 'Cancel',
    id: 'ti5TEd',
    description: 'Text for cancel button',
  });

  const bodyConfirmText = intl.formatMessage(
    {
      defaultMessage: 'Are you sure you want to delete {nodeId}?',
      id: 'iHVVTl',
      description: 'Text for delete node modal body',
    },
    { nodeId: <b>{nodeName}</b> }
  );

  const operationBodyMessage = intl.formatMessage({
    defaultMessage: 'This step will be removed from the Logic App.',
    id: '6lLsi+',
    description: 'Text for delete node modal body',
  });

  const graphBodyMessage = intl.formatMessage({
    defaultMessage: 'This will also remove all child steps.',
    id: 'z9kH+0',
    description: 'Text for delete node modal body',
  });

  const bodyMessage = nodeType === WORKFLOW_NODE_TYPES['OPERATION_NODE'] ? operationBodyMessage : graphBodyMessage;

  const onClosing = useCallback(() => {
    setSpinnerText(closingLoadingMessage);
    onDismiss();
  }, [closingLoadingMessage, onDismiss]);

  return (
    <Dialog inertTrapFocus={true} open={isOpen} aria-labelledby={title} onOpenChange={onClosing} surfaceMotion={null}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{nodeId ? title : ''}</DialogTitle>
          <DialogContent className={styles.modalContainer}>
            {nodeId ? (
              <>
                <p>{bodyConfirmText}</p>
                <p>{bodyMessage}</p>
              </>
            ) : (
              <Spinner label={spinnerText} />
            )}
          </DialogContent>
          <DialogActions>
            <DialogTrigger>
              <Button appearance="primary" onClick={onConfirm}>
                {confirmText}
              </Button>
            </DialogTrigger>
            <DialogTrigger>
              <Button onClick={onClosing}>{cancelText}</Button>
            </DialogTrigger>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

import { FontIcon, Spinner, SpinnerSize } from '@fluentui/react';
import { mergeClasses } from '@fluentui/react-components';
import type React from 'react';
import { useIntl } from 'react-intl';
import { useConnectionContainerStyles } from '../../connectioncontainer.styles';

type ConnectionStatusProps = {
  apiName: string;
  isConnected: boolean;
};

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ apiName, isConnected }) => {
  const intl = useIntl();
  const styles = useConnectionContainerStyles();
  const intlText = {
    connectionsSetupCardDescription: intl.formatMessage({
      defaultMessage: 'Set up these connections to use them in your flow.',
      id: 'blRFVt',
      description: 'Chatbot connections setup card description',
    }),
    connectedText: intl.formatMessage({
      defaultMessage: 'Connected to',
      id: 'xvav7+',
      description: 'Chatbot text stating connection to api was made',
    }),
    notConnectedText: intl.formatMessage({
      defaultMessage: 'Not connected to',
      id: 'Ak2Lka',
      description: 'Chatbot text stating connection to api not made',
    }),
  };
  const statusFormat = isConnected ? intlText.connectedText : intlText.notConnectedText;
  return (
    <span className={'msla-connection-status'}>
      <FontIcon
        iconName={isConnected ? 'Completed' : 'Error'}
        className={mergeClasses(styles.connectionStatusIcon, isConnected && CONNECTED_CLASS)}
      />
      <span className={'msla-connection-status-text'}>
        {statusFormat}
        <span className={'msla-connection-status-bold-text'}>{apiName}</span>
      </span>
    </span>
  );
};

type ConnectionStatusListProps = {
  connectionStatuses: ConnectionStatusProps[];
};

export const ConnectionStatusList: React.FC<ConnectionStatusListProps> = ({ connectionStatuses }) => {
  return (
    <div className={'msla-connection-status-root'}>
      {connectionStatuses.map((status) => (
        <ConnectionStatus key={status.apiName} {...status} />
      ))}
    </div>
  );
};

export const ConnectionsLoading: React.FC = () => {
  const intl = useIntl();
  const intlText = {
    connectionsLoading: intl.formatMessage({
      defaultMessage: 'Connecting to apps and services',
      id: 'qBNM3e',
      description: 'Chatbot connections loading text',
    }),
  };
  return (
    <div className={'msla-connection-status-root'}>
      <span className={'msla-connection-status'}>
        <Spinner className={'msla-connection-status-spinner'} size={SpinnerSize.small} ariaLabel={intlText.connectionsLoading} />
        <span className={'msla-connection-status-text'}>{intlText.connectionsLoading}</span>
      </span>
    </div>
  );
};

const CONNECTED_CLASS = 'is-connected';

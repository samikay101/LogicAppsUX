import type { AuthProps, OAuthProps } from '..';
import type { BaseEditorProps, ChangeState } from '../../editor/base';
import { AuthenticationDropdown } from '../AuthenticationDropdown';
import { AuthenticationProperty } from '../AuthenticationProperty';
import { AUTHENTICATION_PROPERTIES } from '../util';
import { AadOAuthCredentials } from './AADOAuthCredentials';
import type { IDropdownOption } from '@fluentui/react';
import type { Dispatch, SetStateAction } from 'react';
import { useState } from 'react';
import { useIntl } from 'react-intl';

export const AuthenticationOAuthType = {
  SECRET: 'Secret',
  CERTIFICATE: 'Certificate',
} as const;
export type AuthenticationOAuthType = (typeof AuthenticationOAuthType)[keyof typeof AuthenticationOAuthType];

interface ActiveDirectoryAuthenticationProps extends Partial<BaseEditorProps> {
  OauthProps: OAuthProps;
  setCurrentProps: Dispatch<SetStateAction<AuthProps>>;
}

export const ActiveDirectoryAuthentication = ({
  OauthProps,
  setCurrentProps,
  ...props
}: ActiveDirectoryAuthenticationProps): JSX.Element => {
  const intl = useIntl();
  const {
    oauthTenant,
    oauthAudience,
    oauthAuthority,
    oauthClientId,
    oauthType = AuthenticationOAuthType.SECRET,
    oauthTypeSecret,
    oauthTypeCertificatePfx,
    oauthTypeCertificatePassword,
  } = OauthProps;

  const [type, setOauthType] = useState<string | number>(oauthType);

  const updateOAuthAuthority = (newState: ChangeState) => {
    setCurrentProps((prevState: AuthProps) => ({
      ...prevState,
      aadOAuth: { ...prevState.aadOAuth, oauthAuthority: newState.value },
    }));
  };

  const updateOAuthTenant = (newState: ChangeState) => {
    setCurrentProps((prevState: AuthProps) => ({
      ...prevState,
      aadOAuth: { ...prevState.aadOAuth, oauthTenant: newState.value },
    }));
  };

  const updateOAuthAudience = (newState: ChangeState) => {
    setCurrentProps((prevState: AuthProps) => ({
      ...prevState,
      aadOAuth: { ...prevState.aadOAuth, oauthAudience: newState.value },
    }));
  };

  const updateOAuthClientId = (newState: ChangeState) => {
    setCurrentProps((prevState: AuthProps) => ({
      ...prevState,
      aadOAuth: { ...prevState.aadOAuth, oauthClientId: newState.value },
    }));
  };

  const oAuthTypeLabel = intl.formatMessage({
    defaultMessage: 'Credential type',
    id: 'He4Z+v',
    description: 'Authentication OAuth Type Label',
  });

  const onAuthenticationTypeDropdownChange = (_event: React.FormEvent<HTMLDivElement>, item: IDropdownOption): void => {
    const newKey = item?.key;
    if (newKey) {
      setOauthType(newKey);
      setCurrentProps((prevState: AuthProps) => ({
        ...prevState,
        aadOAuth: { ...prevState.aadOAuth, oauthType: item.key as AuthenticationOAuthType },
      }));
    }
  };

  const oAuthTypeSecretLabel = intl.formatMessage({
    defaultMessage: 'Secret',
    id: 'rDDPpJ',
    description: 'Authentication OAuth Secret Type Label',
  });

  const oAuthTypeCertificateLabel = intl.formatMessage({
    defaultMessage: 'Certificate',
    id: 'VlvlX1',
    description: 'Authentication OAuth Certificate Type Label',
  });

  const aadOAuthCredentialTypes: IDropdownOption[] = zipDropDownOptions(
    [AuthenticationOAuthType.SECRET, AuthenticationOAuthType.CERTIFICATE],
    [oAuthTypeSecretLabel, oAuthTypeCertificateLabel]
  );
  return (
    <div className="msla-authentication-editor-OAuth-container">
      <AuthenticationProperty
        {...props}
        initialValue={oauthAuthority}
        AuthProperty={AUTHENTICATION_PROPERTIES.AAD_OAUTH_AUTHORITY}
        handleBlur={updateOAuthAuthority}
      />
      <AuthenticationProperty
        {...props}
        initialValue={oauthTenant}
        AuthProperty={AUTHENTICATION_PROPERTIES.AAD_OAUTH_TENANT}
        handleBlur={updateOAuthTenant}
      />
      <AuthenticationProperty
        {...props}
        initialValue={oauthAudience}
        AuthProperty={AUTHENTICATION_PROPERTIES.AAD_OAUTH_AUDIENCE}
        handleBlur={updateOAuthAudience}
      />
      <AuthenticationProperty
        {...props}
        initialValue={oauthClientId}
        AuthProperty={AUTHENTICATION_PROPERTIES.AAD_OAUTH_CLIENT_ID}
        handleBlur={updateOAuthClientId}
      />
      <AuthenticationDropdown
        readonly={props.readonly}
        dropdownLabel={oAuthTypeLabel}
        selectedKey={type as string}
        options={aadOAuthCredentialTypes}
        onChange={onAuthenticationTypeDropdownChange}
      />
      <AadOAuthCredentials
        {...props}
        selectedCredTypeKey={type as string}
        secret={oauthTypeSecret}
        clientCertificateProps={{ clientCertificatePfx: oauthTypeCertificatePfx, clientCertificatePassword: oauthTypeCertificatePassword }}
        setCurrentProps={setCurrentProps}
      />
    </div>
  );
};

function zipDropDownOptions(keys: string[], texts: string[]): IDropdownOption[] {
  return keys.map((key, index) => {
    const text = texts[index];
    return {
      key,
      text,
    };
  });
}

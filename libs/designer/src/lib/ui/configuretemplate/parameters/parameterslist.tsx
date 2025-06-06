import {
  Link,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import type { AppDispatch, RootState } from '../../../core/state/templates/store';
import { useDispatch, useSelector } from 'react-redux';
import { useResourceStrings } from '../resources';
import { useCallback, useMemo } from 'react';
import { useIntl } from 'react-intl';
import { openPanelView, TemplatePanelView } from '../../../core/state/templates/panelSlice';
import { Edit16Regular } from '@fluentui/react-icons';
import { CustomizeParameterPanel } from '../panels/customizeParameterPanel/customizeParameterPanel';
import { DescriptionWithLink, ErrorBar } from '../common';
import { mergeStyles } from '@fluentui/react';
import { formatNameWithIdentifierToDisplay } from '../../../core/configuretemplate/utils/helper';

const columnTextStyle: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 1,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  wordBreak: 'break-word',
  lineBreak: 'anywhere',
};

export const TemplateParametersList = () => {
  const intl = useIntl();
  const dispatch = useDispatch<AppDispatch>();

  const intlText = {
    AriaLabel: intl.formatMessage({
      defaultMessage: 'List of parameters in the template',
      id: 'u2z3kg',
      description: 'The aria label for the parameters table',
    }),
    Description: intl.formatMessage({
      defaultMessage:
        'Customize each parameter to tailor this template to your needs. These values help configure how your workflows run. You can save your progress anytime and return later to finish, but all fields must be completed for the template to work.',
      id: 'nCjxEh',
      description: 'The description for the parameters tab',
    }),
    ErrorTitle: intl.formatMessage({
      defaultMessage: 'Validation failed for parameters: ',
      id: 'MQ0ODD',
      description: 'The error title for the parameters tab',
    }),
  };

  const { parameterDefinitions, currentPanelView, parameterErrors } = useSelector((state: RootState) => ({
    parameterDefinitions: state.template.parameterDefinitions,
    currentPanelView: state.panel.currentPanelView,
    parameterErrors: state.template.errors.parameters,
  }));

  const formattedParameterErrorIds = useMemo(() => {
    return Object.entries(parameterErrors)
      .filter(([_id, error]) => error)
      .map(([id]) => formatNameWithIdentifierToDisplay(id));
  }, [parameterErrors]);

  const resourceStrings = useResourceStrings();

  const columns = useMemo(() => {
    const baseColumn = [
      { columnKey: 'name', label: resourceStrings.Name },
      { columnKey: 'displayName', label: resourceStrings.DisplayName },
      { columnKey: 'type', label: resourceStrings.Type },
    ];
    const column2 = [
      { columnKey: 'description', label: resourceStrings.Description },
      { columnKey: 'required', label: resourceStrings.Required },
    ];
    return [...baseColumn, ...column2];
  }, [resourceStrings]);

  const items = useMemo(
    () =>
      Object.values(parameterDefinitions)?.map((parameter) => ({
        name: parameter?.name ?? resourceStrings.Placeholder,
        displayName: parameter?.displayName ?? resourceStrings.Placeholder,
        type: parameter.type,
        description: parameter?.description ?? resourceStrings.Placeholder,
        required: parameter?.required ?? false,
      })) ?? [],
    [parameterDefinitions, resourceStrings]
  );

  const handleSelectParameter = useCallback(
    (parameterId: string) => {
      dispatch(openPanelView({ panelView: TemplatePanelView.CustomizeParameter, selectedTabId: parameterId }));
    },
    [dispatch]
  );

  if (Object.keys(parameterDefinitions).length === 0) {
    return (
      <div className="msla-templates-wizard-tab-content" style={{ overflowX: 'auto', paddingTop: '12px' }}>
        <Text>{resourceStrings.NoParameterInTemplate}</Text>
      </div>
    );
  }

  return (
    <div className="msla-templates-wizard-tab-content" style={{ overflowX: 'auto', paddingTop: '12px' }}>
      {currentPanelView === TemplatePanelView.CustomizeParameter && <CustomizeParameterPanel />}
      <DescriptionWithLink
        text={intlText.Description}
        linkText={resourceStrings.LearnMore}
        linkUrl="https://go.microsoft.com/fwlink/?linkid=2321714"
        className={mergeStyles({ marginLeft: '-10px', width: '70%' })}
      />

      {formattedParameterErrorIds.length ? (
        <ErrorBar title={intlText.ErrorTitle} errorMessage={formattedParameterErrorIds.join(', ')} styles={{ marginLeft: '-10px' }} />
      ) : null}

      <Table aria-label={intlText.AriaLabel} size="small" style={{ width: '100%' }}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHeaderCell key={column.columnKey}>
                <Text weight="semibold">{column.label}</Text>
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.name}>
              <TableCell>
                <TableCellLayout
                  style={{
                    overflow: 'hidden',
                  }}
                >
                  <Link
                    style={columnTextStyle}
                    as="button"
                    onClick={() => {
                      handleSelectParameter(item.name);
                    }}
                  >
                    {formatNameWithIdentifierToDisplay(item.name)}
                  </Link>
                </TableCellLayout>
              </TableCell>
              <TableCell>
                <TableCellLayout>
                  <Text style={columnTextStyle}>{item.displayName}</Text>
                </TableCellLayout>
              </TableCell>
              <TableCell>
                <TableCellLayout>
                  <Text style={columnTextStyle}>{item.type}</Text>
                </TableCellLayout>
              </TableCell>
              <TableCell>
                <TableCellLayout>
                  <Text style={columnTextStyle}>{item.description}</Text>
                </TableCellLayout>
              </TableCell>
              <TableCell>
                <TableCellLayout>{item.required ? resourceStrings.RequiredOn : resourceStrings.RequiredOff}</TableCellLayout>
              </TableCell>
              <TableCell>
                <TableCellLayout>
                  <Link
                    style={columnTextStyle}
                    as="button"
                    onClick={() => {
                      handleSelectParameter(item.name);
                    }}
                  >
                    <Edit16Regular />
                  </Link>
                </TableCellLayout>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

import type { IDropdownProps } from '@fluentui/react';
import { SearchBox, DropdownMenuItemType, Dropdown } from '@fluentui/react';
import { mergeClasses } from '@fluentui/react-components';
import type { FC } from 'react';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useSearchableDropdownStyles } from './searchabledropdown.styles';

export interface SearchableDropdownProps {
  dropdownProps: Pick<IDropdownProps, 'options'> & Partial<Omit<IDropdownProps, 'onChange' | 'onDismiss' | 'onRenderItem'>>;
  onItemSelectionChanged: (id: string, isSelected: boolean) => void;
  onDismiss?: () => void;
  labelId?: string;
  searchPlaceholderText?: string;
  showSearchItemThreshold?: number;
  className?: string;
}

export const SearchableDropdown: FC<SearchableDropdownProps> = ({
  dropdownProps,
  onItemSelectionChanged,
  onDismiss,
  searchPlaceholderText,
  showSearchItemThreshold: showFilterItemThreshold,
  className,
  labelId,
}): JSX.Element => {
  const styles = useSearchableDropdownStyles();
  const showFilterInputItemThreshold = showFilterItemThreshold ?? 4;
  const headerKey = 'FilterHeader';

  const intl = useIntl();

  const [conditionalVisibilityTempArray, setConditionalVisibilityTempArray] = useState<string[]>([]);
  const [filterText, setFilterText] = useState('');

  const searchOperation =
    searchPlaceholderText ??
    intl.formatMessage({
      defaultMessage: 'Search',
      id: 'Fcvgvg',
      description: 'Default placeholder for search box that searches dropdown options',
    });

  const options = dropdownProps.options.filter((option) => option.text.toLowerCase().includes(filterText.toLowerCase()));

  if (dropdownProps.options.length >= showFilterInputItemThreshold) {
    options.unshift(
      { key: headerKey, text: '', itemType: DropdownMenuItemType.Header },
      { key: 'FilterDivider', text: '-', itemType: DropdownMenuItemType.Divider }
    );
  }

  return (
    <Dropdown
      {...dropdownProps}
      aria-labelledby={labelId}
      className={mergeClasses(styles.searchableDropdown, className)}
      options={options}
      selectedKeys={conditionalVisibilityTempArray}
      onChange={(_e: any, item: any) => {
        if (item?.key) {
          setConditionalVisibilityTempArray(
            conditionalVisibilityTempArray.includes(item.key)
              ? conditionalVisibilityTempArray.filter((key) => key !== item.key)
              : [...conditionalVisibilityTempArray, item.key]
          );
        }
      }}
      onDismiss={() => {
        onDismiss?.();
        conditionalVisibilityTempArray.forEach((parameterId) => {
          onItemSelectionChanged(parameterId, true);
        });
        setConditionalVisibilityTempArray([]);
        setFilterText('');
      }}
      onRenderItem={(item, defaultRenderer) => {
        if (item?.key === headerKey) {
          return (
            <SearchBox
              autoFocus={true}
              className={styles.searchableDropdownSearch}
              onChange={(e, newValue) => setFilterText(newValue ?? '')}
              placeholder={searchOperation}
              key={headerKey}
            />
          );
        }

        return defaultRenderer?.(item) ?? null;
      }}
    />
  );
};

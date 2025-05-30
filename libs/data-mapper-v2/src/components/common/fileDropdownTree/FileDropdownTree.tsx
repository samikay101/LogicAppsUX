import { Tree, TreeItem, TreeItemLayout, Text, mergeClasses } from '@fluentui/react-components';
import { SearchBox } from '@fluentui/react';
import { ChevronRightRegular, ChevronDownRegular } from '@fluentui/react-icons';
import { useIntl } from 'react-intl';
import type { IFileSysTreeItem } from '@microsoft/logic-apps-shared';
import useStyles from '../styles';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { isEmptyString } from '@microsoft/logic-apps-shared';

export interface FileDropdownTreeProps {
  onItemSelect: (item: IFileSysTreeItem) => void;
  className?: string;
  placeholder: string;
  fileTree: IFileSysTreeItem[];
  existingSelectedFile?: string;
  onReopen: () => void;
}

export const FileDropdownTree = ({
  onItemSelect,
  placeholder,
  className,
  fileTree,
  onReopen,
  existingSelectedFile,
}: FileDropdownTreeProps) => {
  const [showDropdownTree, setShowDropdownTree] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

  useEffect(() => {
    if (selectedFileName === '' && existingSelectedFile) {
      setSelectedFileName(existingSelectedFile);
    }
  }, [selectedFileName, existingSelectedFile]);

  const intl = useIntl();
  const styles = useStyles();

  const search = intl.formatMessage({
    defaultMessage: 'Search',
    id: 'toWTrl',
    description: 'Search from file list',
  });

  const onFileNameSelect = (item: IFileSysTreeItem) => {
    setSelectedFileName(item.name);
    onItemSelect(item);
    setShowDropdownTree(false);
  };

  const filterDropdownItem = useCallback((item: IFileSysTreeItem, value: string): IFileSysTreeItem | undefined => {
    if (isEmptyString(value) || item.name.includes(value)) {
      return item;
    }

    if (item.type === 'directory') {
      const children = item.children
        .map((child) => filterDropdownItem(child, value))
        .filter((child) => child !== undefined) as IFileSysTreeItem[];

      if (children.length === 0) {
        return undefined;
      }
      return {
        ...item,
        children: children,
      };
    }

    return undefined;
  }, []);

  const filteredItems = useMemo(
    () => fileTree.map((item) => filterDropdownItem(item, searchValue)).filter((item) => item !== undefined) as IFileSysTreeItem[],
    [fileTree, searchValue, filterDropdownItem]
  );

  const displayTree = (item: IFileSysTreeItem): JSX.Element => {
    if (item.type === 'directory') {
      const childElements = item.children.map((child: IFileSysTreeItem) => displayTree(child));
      return (
        <TreeItem itemType="branch">
          <TreeItemLayout>{item.name}</TreeItemLayout>
          <Tree>{childElements}</Tree>
        </TreeItem>
      );
    }
    return (
      <TreeItem key={item.fullPath} value={item.fullPath} onClick={(_) => onFileNameSelect(item)} itemType="leaf">
        <TreeItemLayout>{item.name}</TreeItemLayout>
      </TreeItem>
    );
  };

  const onSearchValueChange = (_event?: React.ChangeEvent<HTMLInputElement>, newValue?: string) => {
    setSearchValue(newValue ?? '');
  };

  return (
    <div className={mergeClasses(styles.componentWrapper, className ?? '')}>
      <div
        className={styles.dropdownInputWrapper}
        onClick={() => {
          setShowDropdownTree(!showDropdownTree);
          onReopen();
        }}
      >
        <Text className={styles.dropdownInput} defaultValue={placeholder}>
          {selectedFileName === '' ? placeholder : selectedFileName}
        </Text>
        {showDropdownTree ? (
          <ChevronDownRegular className={styles.dropdownChevronIcon} />
        ) : (
          <ChevronRightRegular className={styles.dropdownChevronIcon} />
        )}
      </div>
      {showDropdownTree && (
        <div className={styles.dropdownInputValue}>
          <SearchBox placeholder={search} onChange={onSearchValueChange} />
          <Tree className={styles.treeWrapper} aria-label="tree">
            {filteredItems.map((item: IFileSysTreeItem, index: number) => (
              <span key={`tree-${index}`}>{displayTree(item)}</span>
            ))}
          </Tree>
        </div>
      )}
    </div>
  );
};

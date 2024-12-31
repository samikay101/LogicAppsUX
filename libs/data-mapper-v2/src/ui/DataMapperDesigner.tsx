import { useCallback, useEffect, useState } from 'react';
import { EditorCommandBar } from '../components/commandBar/EditorCommandBar';
import { useStaticStyles, useStyles } from './styles';
import { FunctionPanel } from '../components/functionsPanel/FunctionPanel';
import {
  DataMapperWrappedContext,
  InitDataMapperFileService,
  type ScrollLocation,
  type ScrollProps,
  type IDataMapperFileService,
} from '../core';
import { CodeViewPanel } from '../components/codeView/CodeViewPanel';
import { ReactFlowWrapper } from '../components/canvas/ReactFlow';
import { TestPanel } from '../components/test/TestPanel';
import DialogView from './DialogView';
import { useDispatch } from 'react-redux';
import { setSelectedItem } from '../core/state/DataMapSlice';
import type { ILoggerService } from '@microsoft/logic-apps-shared';
import { DevLogger, InitLoggerService } from '@microsoft/logic-apps-shared';

interface DataMapperDesignerProps {
  fileService: IDataMapperFileService;
  loggerService?: ILoggerService;
  setIsMapStateDirty?: (isMapStateDirty: boolean) => void;
}

export const DataMapperDesigner = ({ fileService, loggerService, setIsMapStateDirty }: DataMapperDesignerProps) => {
  useStaticStyles();
  const styles = useStyles();
  const [sourceScroll, setSourceScroll] = useState<ScrollProps>();
  const [targetScroll, setTargetScroll] = useState<ScrollProps>();
  const dispatch = useDispatch();

  const setScroll = useCallback(
    (scrollProps: ScrollProps, location: ScrollLocation) => {
      if (location === 'source') {
        setSourceScroll(scrollProps);
      } else if (location === 'target') {
        setTargetScroll(scrollProps);
      }
    },
    [setSourceScroll, setTargetScroll]
  );

  const loggerServices: ILoggerService[] = [];
  if (loggerService) {
    loggerServices.push(loggerService);
  }
  if (process.env.NODE_ENV !== 'production') {
    loggerServices.push(new DevLogger());
  }

  InitLoggerService(loggerServices);

  if (fileService) {
    InitDataMapperFileService(fileService);
  }

  const onContainerClick = useCallback(
    (e?: any) => {
      if (!e?.target?.dataset?.selectableid) {
        dispatch(setSelectedItem());
      }
    },
    [dispatch]
  );

  useEffect(() => {
    if (fileService) {
      fileService.readCurrentCustomXsltPathOptions();
    }
  }, [fileService]);
  return (
    // danielle rename back and add width and height
    <DataMapperWrappedContext.Provider
      value={{
        scroll: {
          source: sourceScroll,
          target: targetScroll,
          setScroll,
        },
      }}
    >
      <EditorCommandBar />
      <div className={styles.root} onClick={onContainerClick}>
        <DialogView />
        <FunctionPanel />
        <ReactFlowWrapper setIsMapStateDirty={setIsMapStateDirty} />
        <CodeViewPanel />
        <TestPanel />
      </div>
    </DataMapperWrappedContext.Provider>
  );
};

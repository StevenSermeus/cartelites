import {Modal,type ModalProps} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';

/** Native sheet behavior is retained; optional motion follows the live OS setting. */
export function MotionModal(props:ModalProps) {
  const {reduceMotion}=useTheme();
  return <Modal {...props} animationType={reduceMotion?'none':props.animationType}/>;
}

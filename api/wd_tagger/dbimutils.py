import cv2
import numpy as np


def make_square(img: np.ndarray, target_size: int) -> np.ndarray:
    old_size = img.shape[:2]
    desired_size = max(old_size)
    desired_size = max(desired_size, target_size)

    delta_w = desired_size - old_size[1]
    delta_h = desired_size - old_size[0]
    top, bottom = delta_h // 2, delta_h - (delta_h // 2)
    left, right = delta_w // 2, delta_w - (delta_w // 2)

    color = [255, 255, 255]
    return cv2.copyMakeBorder(
        img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color
    )


def smart_resize(img: np.ndarray, size: int) -> np.ndarray:
    if img.shape[0] > size:
        return cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA)
    if img.shape[0] < size:
        return cv2.resize(img, (size, size), interpolation=cv2.INTER_CUBIC)
    return img

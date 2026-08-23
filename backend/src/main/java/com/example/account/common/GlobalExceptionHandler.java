package com.example.account.common;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice   // 关键注解：让这个类成为全局异常「总接待台」
public class GlobalExceptionHandler {

    // 1. 专门接住「参数校验失败」的异常
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)  // 返回 400 状态码
    public Map<String, Object> handleValidation(MethodArgumentNotValidException e) {
        // 取出第一条校验失败的提示语（就是你 message 里写的那句）
        String msg = e.getBindingResult().getFieldError().getDefaultMessage();
        Map<String, Object> result = new HashMap<>();
        result.put("code", 400);
        result.put("message", msg);
        return result;
    }

    // 2. 兜底：接住其他所有没预料到的异常，避免把堆栈甩给前端
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)  // 返回 500
    public Map<String, Object> handleOther(Exception e) {
        e.printStackTrace();  // 后端控制台仍打印，方便你自己排查
        Map<String, Object> result = new HashMap<>();
        result.put("code", 500);
        result.put("message", "服务器内部错误，请稍后再试");
        return result;
    }
}
